import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, StatusBar, LayoutAnimation, UIManager, Platform, Dimensions, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

export default function SlideshowScreen({ route, navigation }) {
  const { roomId, memories, roomName, interval = 5 } = route.params;
  const [liveMemories, setLiveMemories] = useState(memories || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [outgoingMemory, setOutgoingMemory] = useState(memories && memories.length > 0 ? memories[0] : null);
  
  const transitionAnim = useRef(new Animated.Value(1)).current;
  const knownIdsRef = useRef(new Set((memories || []).map(m => m.id)));

  // Sincronización en tiempo real
  useEffect(() => {
    if (!roomId) return;
    
    const q = query(collection(db, 'notas_fotos'), where('roomId', '==', roomId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          note: data.note,
          remoteUrl: data.imageUrl,
          userName: data.userName || 'Usuario',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        };
      });
      
      const sorted = fetched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Detectar si hay fotos nuevas
      let hasNewPhotos = false;
      let latestNewUri = null;
      sorted.forEach(photo => {
        if (!knownIdsRef.current.has(photo.id)) {
          hasNewPhotos = true;
          knownIdsRef.current.add(photo.id);
          if (!latestNewUri) latestNewUri = photo.localUri || photo.remoteUrl;
        }
      });

      if (hasNewPhotos && latestNewUri) {
        // Pre-cargar la imagen antes de mostrarla para evitar el parpadeo negro
        Image.prefetch(latestNewUri).then(() => {
          setLiveMemories(sorted);
          setCurrentIndex(0);
        }).catch(() => {
          setLiveMemories(sorted);
          setCurrentIndex(0);
        });
      } else {
        setLiveMemories(sorted);
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // Filtrar memorias válidas
  const validMemories = liveMemories.filter(m => m.localUri || m.remoteUrl);

  // Prevenir desbordamiento del índice si se borran fotos
  useEffect(() => {
    if (validMemories.length > 0 && currentIndex >= validMemories.length) {
      setCurrentIndex(0);
    }
  }, [validMemories.length, currentIndex]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (validMemories.length > 0) {
        handleNext();
      }
    }, interval * 1000);

    return () => clearInterval(timer);
  }, [currentIndex, validMemories, interval]);

  const isTransitioning = useRef(false);

  const handleNext = () => {
    if (validMemories.length === 0 || isTransitioning.current) return;
    
    const nextIndex = (currentIndex + 1) % validMemories.length;
    const nextMem = validMemories[nextIndex];
    const nextUri = nextMem.localUri || nextMem.remoteUrl;

    isTransitioning.current = true;

    Image.prefetch(nextUri).then(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOutgoingMemory(validMemories[currentIndex]);
      transitionAnim.setValue(0);
      setCurrentIndex(nextIndex);

      Animated.timing(transitionAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        setOutgoingMemory(validMemories[nextIndex]);
        isTransitioning.current = false;
      });
    }).catch(() => {
      // Si falla la descarga, avanzar de todos modos
      setCurrentIndex(nextIndex);
      isTransitioning.current = false;
    });
  };

  const handlePrev = () => {
    if (validMemories.length === 0 || isTransitioning.current) return;
    
    const prevIndex = currentIndex === 0 ? validMemories.length - 1 : currentIndex - 1;
    const prevMem = validMemories[prevIndex];
    const prevUri = prevMem.localUri || prevMem.remoteUrl;

    isTransitioning.current = true;

    Image.prefetch(prevUri).then(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOutgoingMemory(validMemories[currentIndex]);
      transitionAnim.setValue(0);
      setCurrentIndex(prevIndex);

      Animated.timing(transitionAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start(() => {
        setOutgoingMemory(validMemories[prevIndex]);
        isTransitioning.current = false;
      });
    }).catch(() => {
      setCurrentIndex(prevIndex);
      isTransitioning.current = false;
    });
  };

  if (validMemories.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar hidden />
        <Text style={{ color: '#555', fontSize: 18 }}>La sala se ha quedado sin fotos.</Text>
        <TouchableOpacity style={[styles.closeBtn, { marginTop: 20 }]} onPress={() => navigation.goBack()}>
          <Text style={styles.closeBtnText}>Volver a la sala</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const currentMemory = validMemories[currentIndex];
  const imageUri = currentMemory.localUri || currentMemory.remoteUrl;

  // Consideramos "NUEVA" a cualquier foto subida en los últimos 60 segundos
  const isNew = new Date() - new Date(currentMemory.createdAt) < 60000;

  // Preparamos datos para el mosaico de fondo: vista previa de las siguientes 32 fotos
  const mosaicData = [];
  if (validMemories.length > 0) {
    for (let i = 1; i <= 32; i++) {
      const globalIndex = currentIndex + i;
      const actualIdx = globalIndex % validMemories.length;
      mosaicData.push({ ...validMemories[actualIdx], uniqueKey: `track_${globalIndex}` });
    }
  }

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const outgoingTranslateY = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height], // Cae hacia abajo fuera de la pantalla
  });
  const outgoingScale = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.2], // Se minimiza
  });
  const outgoingOpacity = transitionAnim.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 0, 0], 
  });

  const incomingTranslateX = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-(width * 0.4), 0], // Viene desde la izquierda
  });
  const incomingTranslateY = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-(height * 0.4), 0], // Viene desde arriba
  });
  const incomingScale = transitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 1], // Arranca chiquito
  });
  const incomingOpacity = transitionAnim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 1, 1],
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />
      
      {/* Se eliminó la cabecera (Botón volver y título pequeño) */}

      {/* 2. Área Central de la Imagen */}
      <View style={styles.imageSection}>
        
        {/* Fondo de Mosaico (Próximas fotos con LayoutAnimation) */}
        <View style={styles.mosaicBackground}>
          {mosaicData.map((mem) => (
            <Image 
              key={mem.uniqueKey} 
              source={{ uri: mem.localUri || mem.remoteUrl }} 
              style={[
                styles.mosaicImage,
                { width: isLandscape ? '12.5%' : '25%' }
              ]} 
            />
          ))}
        </View>
        
        {/* Capa de oscurecimiento sobre el mosaico con tono sepia/cálido */}
        <View style={styles.mosaicOverlay} />

        {/* Adornos de Álbum de Recuerdos */}
        <View style={styles.albumFrame} pointerEvents="none" />
        <View style={styles.albumFrameInner} pointerEvents="none" />
        
        <View style={styles.albumTitleContainer} pointerEvents="none">
          <Text style={styles.albumTitleText}>{roomName}</Text>
        </View>

        {/* Imagen Saliente */}
        {outgoingMemory && (
          <Animated.View style={[
            styles.mainImageWrapper, 
            { 
              transform: [{ translateY: outgoingTranslateY }, { scale: outgoingScale }],
              opacity: outgoingOpacity,
              zIndex: 3
            }
          ]} pointerEvents="none">
            <Image 
              source={{ uri: outgoingMemory.localUri || outgoingMemory.remoteUrl }} 
              style={styles.mainImage} 
              resizeMode="contain" 
            />
          </Animated.View>
        )}

        {/* Imagen Entrante (Principal) */}
        <Animated.View style={[styles.mainImageWrapper, { 
          transform: [
            { translateX: incomingTranslateX },
            { translateY: incomingTranslateY },
            { scale: incomingScale }
          ],
          opacity: incomingOpacity,
          zIndex: 2
        }]} pointerEvents="none">
          <Image 
            source={{ uri: imageUri }} 
            style={styles.mainImage} 
            resizeMode="contain" 
          />
        </Animated.View>

        {/* Etiqueta de NUEVO */}
        {isNew && (
          <View style={styles.newBadge} pointerEvents="none">
            <Text style={styles.newBadgeText}>★ NUEVO</Text>
          </View>
        )}
        
        {/* Nota estilo Hoja / Post-it en la esquina inferior */}
        {currentMemory.note ? (
          <Animated.View style={[styles.stickyNote, { opacity: incomingOpacity }]} pointerEvents="none">
            <Text style={styles.stickyNoteText}>{currentMemory.note}</Text>
            {currentMemory.userName && (
              <Text style={styles.stickyNoteAuthor}>- {currentMemory.userName}</Text>
            )}
          </Animated.View>
        ) : null}

        {/* Controles táctiles superpuestos al final para que capten los clics */}
        <TouchableOpacity style={styles.touchLeft} onPress={handlePrev} activeOpacity={1} />
        <TouchableOpacity style={styles.touchRight} onPress={handleNext} activeOpacity={1} />

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', 
  },
  imageSection: {
    flex: 1,
    position: 'relative', 
  },
  mosaicBackground: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  mosaicImage: {
    width: '25%', // 4 columnas
    aspectRatio: 1,
    resizeMode: 'cover',
    opacity: 0.5,
  },
  mosaicOverlay: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(35, 25, 20, 0.78)', // Sepia oscuro en vez de gris/negro
  },
  albumFrame: {
    position: 'absolute',
    top: 20, bottom: 20, left: 20, right: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.4)', // Dorado
    borderRadius: 8,
    zIndex: 1,
  },
  albumFrameInner: {
    position: 'absolute',
    top: 28, bottom: 28, left: 28, right: 28,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.15)',
    borderRadius: 4,
    zIndex: 1,
  },
  albumTitleContainer: {
    position: 'absolute',
    top: 45,
    left: 45,
    zIndex: 10,
    elevation: 10,
  },
  albumTitleText: {
    color: '#FDFBF7',
    fontSize: 48,
    fontFamily: Platform.OS === 'ios' ? 'Baskerville' : 'serif',
    fontStyle: 'italic',
    fontWeight: '400',
    letterSpacing: 4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  mainImageWrapper: {
    position: 'absolute',
    top: 0, bottom: 0, left: 0, right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  stickyNote: {
    position: 'absolute',
    bottom: 10,
    right: 15,
    backgroundColor: '#F7F4EB', // Color papel antiguo / crema
    paddingVertical: 15, // Reducido para que ocupe menos espacio
    paddingHorizontal: 20,
    maxWidth: '50%',
    minWidth: 200,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#D4C5B0',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 15,
    zIndex: 4,
    transform: [{ rotate: '-3deg' }], // Lado izquierdo hacia abajo
  },
  stickyNoteText: {
    color: '#3E362E', 
    fontSize: 20, // Letra ligeramente más pequeña
    fontWeight: '500',
    fontStyle: 'italic',
    lineHeight: 28, // Altura de línea más compacta
    fontFamily: Platform.OS === 'ios' ? 'Baskerville' : 'serif',
  },
  stickyNoteAuthor: {
    color: '#8A3A3A', 
    fontSize: 13,
    marginTop: 8, // Menos espacio entre texto y autor
    textAlign: 'right',
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Baskerville' : 'serif',
  },
  touchLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    zIndex: 10,
  },
  touchRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '50%',
    zIndex: 10,
  },
  newBadge: {
    position: 'absolute',
    top: 80,
    right: 30,
    backgroundColor: '#FF3B30', // Rojo brillante llamativo
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
    transform: [{ rotate: '5deg' }],
  },
  newBadgeText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  }
});
