import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated, StatusBar, Easing, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

// ─── LAYOUTS ──────────────────────────────────────────────────────────
// Cada celda: { left, top, width, height } en porcentajes (0-100)
// Espiral horaria: izq↓, abajo→, der↑, arriba←

const GAP = 0.8;

const LAYOUT_WIDE = {
  main: { left: 20, top: 20, width: 60, height: 60 },
  cells: [
    { left: 0, top: 20, width: 20, height: 20 },   // 2
    { left: 0, top: 40, width: 20, height: 20 },   // 3
    { left: 0, top: 60, width: 20, height: 20 },   // 4
    { left: 0, top: 80, width: 20, height: 20 },   // 5
    { left: 20, top: 80, width: 20, height: 20 },  // 6
    { left: 40, top: 80, width: 20, height: 20 },  // 7
    { left: 60, top: 80, width: 20, height: 20 },  // 8
    { left: 80, top: 80, width: 20, height: 20 },  // 9
    { left: 80, top: 60, width: 20, height: 20 },  // 10
    { left: 80, top: 40, width: 20, height: 20 },  // 11
    { left: 80, top: 20, width: 20, height: 20 },  // 12
    { left: 80, top: 0, width: 20, height: 20 },   // 13
    { left: 60, top: 0, width: 20, height: 20 },   // 14
    { left: 40, top: 0, width: 20, height: 20 },   // 15
    { left: 20, top: 0, width: 20, height: 20 },   // 16
    { left: 0, top: 0, width: 20, height: 20 },    // 17
  ]
};

const LAYOUT_VERTICAL = {
  main: { left: 37.5, top: 20, width: 25, height: 60 },
  cells: [
    { left: 0, top: 20, width: 15, height: 20 },
    { left: 0, top: 40, width: 15, height: 20 },
    { left: 0, top: 60, width: 15, height: 20 },
    { left: 0, top: 80, width: 15, height: 20 },
    { left: 15, top: 80, width: 22.5, height: 20 },
    { left: 62.5, top: 60, width: 22.5, height: 40 },
    { left: 62.5, top: 80, width: 22.5, height: 20 },
    { left: 85, top: 80, width: 15, height: 20 },
    { left: 85, top: 60, width: 15, height: 20 },
    { left: 85, top: 40, width: 15, height: 20 },
    { left: 85, top: 20, width: 15, height: 20 },
    { left: 85, top: 0, width: 15, height: 20 },
    { left: 62.5, top: 0, width: 22.5, height: 20 },
    { left: 15, top: 20, width: 22.5, height: 40 },
    { left: 15, top: 0, width: 22.5, height: 20 },
    { left: 0, top: 0, width: 15, height: 20 },
  ]
};

function getLayoutForOrientation() {
  return LAYOUT_WIDE; // Siempre usar el diseño horizontal (a petición del usuario)
}

// Convertir porcentaje a píxeles
function pct(val, total) {
  return (val / 100) * total;
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────
export default function SlideshowNewScreen({ route, navigation }) {
  const { roomId, memories, roomName, interval = 5 } = route.params;
  const [liveMemories, setLiveMemories] = useState(memories || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageOrientation, setImageOrientation] = useState('horizontal');
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Estado de animación: null = reposo, array = animando
  const [transitionFrames, setTransitionFrames] = useState(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);
  const knownIdsRef = useRef(new Set((memories || []).map(m => m.id)));

  // ─── SINCRONIZACIÓN EN TIEMPO REAL ───
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

  const validMemories = liveMemories.filter(m => m.localUri || m.remoteUrl);

  useEffect(() => {
    if (validMemories.length > 0 && currentIndex >= validMemories.length) {
      setCurrentIndex(0);
    }
  }, [validMemories.length, currentIndex]);

  // ─── LA ORIENTACIÓN AHORA ES SIEMPRE HORIZONTAL (LAYOUT_WIDE) ───


  // ─── Capturar tamaño del contenedor ───
  const onGridLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setContainerSize({ w: width, h: height });
  }, []);

  // ─── AUTO-AVANCE ───
  useEffect(() => {
    const timer = setInterval(() => {
      if (validMemories.length > 0) handleNext();
    }, interval * 1000);
    return () => clearInterval(timer);
  }, [currentIndex, validMemories, interval]);

  // ─── TRANSICIÓN ANIMADA (CONVEYOR BELT) ───
  const handleNext = useCallback(() => {
    if (validMemories.length === 0 || isTransitioning.current) return;
    if (containerSize.w === 0) return;

    const nextIndex = (currentIndex + 1) % validMemories.length;
    const nextMem = validMemories[nextIndex];
    const nextUri = nextMem.localUri || nextMem.remoteUrl;

    isTransitioning.current = true;

    Image.prefetch(nextUri).then(() => {
      const layout = getLayoutForOrientation(imageOrientation);
      const { w, h } = containerSize;
      const numCells = layout.cells.length;

      // Construir frames de animación para cada foto visible
      const frames = [];

      // 1. La foto principal actual → se encoge y desaparece
      frames.push({
        uri: (validMemories[currentIndex].localUri || validMemories[currentIndex].remoteUrl),
        from: {
          left: pct(layout.main.left + GAP / 2, w),
          top: pct(layout.main.top + GAP / 2, h),
          width: pct(layout.main.width - GAP, w),
          height: pct(layout.main.height - GAP, h),
        },
        to: {
          left: pct(layout.main.left + GAP / 2, w) + pct(layout.main.width - GAP, w) * 0.3,
          top: pct(layout.main.top + GAP / 2, h) + pct(layout.main.height - GAP, h) * 0.3,
          width: pct(layout.main.width - GAP, w) * 0.4,
          height: pct(layout.main.height - GAP, h) * 0.4,
        },
        isExiting: true,
        zIndex: 6,
        isMain: true,
        borderRadius: 10,
      });

      // 2. Celda[0] → se mueve al centro (se convierte en la nueva principal)
      const cell0 = layout.cells[0];
      frames.push({
        uri: (validMemories[(currentIndex + 1) % validMemories.length].localUri || validMemories[(currentIndex + 1) % validMemories.length].remoteUrl),
        from: {
          left: pct(cell0.left + GAP / 2, w),
          top: pct(cell0.top + GAP / 2, h),
          width: pct(cell0.width - GAP, w),
          height: pct(cell0.height - GAP, h),
        },
        to: {
          left: pct(layout.main.left + GAP / 2, w),
          top: pct(layout.main.top + GAP / 2, h),
          width: pct(layout.main.width - GAP, w),
          height: pct(layout.main.height - GAP, h),
        },
        isExiting: false,
        zIndex: 5,
        isMain: false,
        borderRadius: 10,
      });

      // 3. Celdas [1..n-1] → cada una se mueve a la posición anterior
      for (let i = 1; i < numCells; i++) {
        const fromCell = layout.cells[i];
        const toCell = layout.cells[i - 1];
        const memIdx = (currentIndex + i + 1) % validMemories.length;
        frames.push({
          uri: (validMemories[memIdx].localUri || validMemories[memIdx].remoteUrl),
          from: {
            left: pct(fromCell.left + GAP / 2, w),
            top: pct(fromCell.top + GAP / 2, h),
            width: pct(fromCell.width - GAP, w),
            height: pct(fromCell.height - GAP, h),
          },
          to: {
            left: pct(toCell.left + GAP / 2, w),
            top: pct(toCell.top + GAP / 2, h),
            width: pct(toCell.width - GAP, w),
            height: pct(toCell.height - GAP, h),
          },
          isExiting: false,
          zIndex: 2,
          isMain: false,
          borderRadius: 6,
        });
      }

      // 4. Nueva foto entra en la última celda (fade in)
      const lastCell = layout.cells[numCells - 1];
      const newMemIdx = (currentIndex + numCells + 1) % validMemories.length;
      frames.push({
        uri: (validMemories[newMemIdx].localUri || validMemories[newMemIdx].remoteUrl),
        from: {
          left: pct(lastCell.left + GAP / 2, w),
          top: pct(lastCell.top + GAP / 2, h),
          width: pct(lastCell.width - GAP, w),
          height: pct(lastCell.height - GAP, h),
        },
        to: {
          left: pct(lastCell.left + GAP / 2, w),
          top: pct(lastCell.top + GAP / 2, h),
          width: pct(lastCell.width - GAP, w),
          height: pct(lastCell.height - GAP, h),
        },
        isExiting: false,
        isEntering: true,
        zIndex: 1,
        isMain: false,
        borderRadius: 6,
      });

      setTransitionFrames(frames);
      slideAnim.setValue(0);

      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setTransitionFrames(null);
        setCurrentIndex(nextIndex);
        isTransitioning.current = false;
      });
    }).catch(() => {
      setCurrentIndex(nextIndex);
      isTransitioning.current = false;
    });
  }, [currentIndex, validMemories, imageOrientation, containerSize]);

  const handlePrev = useCallback(() => {
    if (validMemories.length === 0 || isTransitioning.current) return;
    if (containerSize.w === 0) return;

    const prevIndex = currentIndex === 0 ? validMemories.length - 1 : currentIndex - 1;
    const prevMem = validMemories[prevIndex];
    const prevUri = prevMem.localUri || prevMem.remoteUrl;

    isTransitioning.current = true;

    Image.prefetch(prevUri).then(() => {
      const layout = getLayoutForOrientation(imageOrientation);
      const { w, h } = containerSize;
      const numCells = layout.cells.length;

      const frames = [];

      // La principal actual → se mueve a celda[0]
      frames.push({
        uri: (validMemories[currentIndex].localUri || validMemories[currentIndex].remoteUrl),
        from: {
          left: pct(layout.main.left + GAP / 2, w),
          top: pct(layout.main.top + GAP / 2, h),
          width: pct(layout.main.width - GAP, w),
          height: pct(layout.main.height - GAP, h),
        },
        to: {
          left: pct(layout.cells[0].left + GAP / 2, w),
          top: pct(layout.cells[0].top + GAP / 2, h),
          width: pct(layout.cells[0].width - GAP, w),
          height: pct(layout.cells[0].height - GAP, h),
        },
        isExiting: false,
        zIndex: 5,
        isMain: false,
        borderRadius: 6,
      });

      // La foto anterior → entra al centro (nueva principal)
      frames.push({
        uri: prevUri,
        from: {
          left: pct(layout.main.left + GAP / 2, w) + pct(layout.main.width - GAP, w) * 0.3,
          top: pct(layout.main.top + GAP / 2, h) + pct(layout.main.height - GAP, h) * 0.3,
          width: pct(layout.main.width - GAP, w) * 0.4,
          height: pct(layout.main.height - GAP, h) * 0.4,
        },
        to: {
          left: pct(layout.main.left + GAP / 2, w),
          top: pct(layout.main.top + GAP / 2, h),
          width: pct(layout.main.width - GAP, w),
          height: pct(layout.main.height - GAP, h),
        },
        isExiting: false,
        isEntering: true,
        zIndex: 6,
        isMain: true,
        borderRadius: 10,
      });

      // Cada celda se mueve a la siguiente posición
      for (let i = 0; i < numCells - 1; i++) {
        const fromCell = layout.cells[i];
        const toCell = layout.cells[i + 1];
        const memIdx = (currentIndex + i + 1) % validMemories.length;
        frames.push({
          uri: (validMemories[memIdx].localUri || validMemories[memIdx].remoteUrl),
          from: {
            left: pct(fromCell.left + GAP / 2, w),
            top: pct(fromCell.top + GAP / 2, h),
            width: pct(fromCell.width - GAP, w),
            height: pct(fromCell.height - GAP, h),
          },
          to: {
            left: pct(toCell.left + GAP / 2, w),
            top: pct(toCell.top + GAP / 2, h),
            width: pct(toCell.width - GAP, w),
            height: pct(toCell.height - GAP, h),
          },
          isExiting: false,
          zIndex: 2,
          isMain: false,
          borderRadius: 6,
        });
      }

      setTransitionFrames(frames);
      slideAnim.setValue(0);

      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 700,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setTransitionFrames(null);
        setCurrentIndex(prevIndex);
        isTransitioning.current = false;
      });
    }).catch(() => {
      setCurrentIndex(prevIndex);
      isTransitioning.current = false;
    });
  }, [currentIndex, validMemories, imageOrientation, containerSize]);

  // ─── PANTALLA VACÍA ───
  if (validMemories.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar hidden />
        <Text style={{ color: '#555', fontSize: 18 }}>La sala se ha quedado sin fotos.</Text>
      </SafeAreaView>
    );
  }

  // ─── PREPARAR DATOS ───
  const currentMemory = validMemories[currentIndex];
  const mainUri = currentMemory.localUri || currentMemory.remoteUrl;
  const isNew = new Date() - new Date(currentMemory.createdAt) < 60000;
  const layout = getLayoutForOrientation(imageOrientation);
  const numCells = layout.cells.length;

  const cellPhotos = [];
  for (let i = 1; i <= numCells; i++) {
    const idx = (currentIndex + i) % validMemories.length;
    cellPhotos.push(validMemories[idx]);
  }

  // ─── RENDER ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden />

      {/* Fondo Ambiental Dinámico (Imagen difuminada) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Image 
          source={{ uri: mainUri }} 
          style={[StyleSheet.absoluteFillObject, { opacity: 0.8 }]} 
          blurRadius={60} 
          resizeMode="cover"
        />
        {/* Capa oscurecedora para mantener el contraste */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(10, 15, 25, 0.75)' }]} />
      </View>

      {/* Título de la sala decorativo (Sup Izquierda) */}
      <View style={styles.roomTitleContainer} pointerEvents="none">
        <Text style={styles.roomTitleText}>{roomName}</Text>
      </View>

      {/* Grid */}
      <View style={styles.gridContainer} onLayout={onGridLayout}>

        {transitionFrames ? (
          /* ═══ MODO ANIMACIÓN: cada foto se desliza a su nueva posición ═══ */
          transitionFrames.map((frame, idx) => {
            const fL = frame.from.left, fT = frame.from.top, fW = frame.from.width, fH = frame.from.height;
            const tL = frame.to.left, tT = frame.to.top, tW = frame.to.width, tH = frame.to.height;

            const cX_from = fL + fW / 2;
            const cY_from = fT + fH / 2;
            const cX_to = tL + tW / 2;
            const cY_to = tT + tH / 2;

            const tx = cX_to - cX_from;
            const ty = cY_to - cY_from;
            const sx = tW / fW;
            const sy = tH / fH;

            const animTranslateX = slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, tx],
            });
            const animTranslateY = slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, ty],
            });
            const animScaleX = slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, sx],
            });
            const animScaleY = slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, sy],
            });

            let animOpacity = 1;
            if (frame.isExiting) {
              animOpacity = slideAnim.interpolate({
                inputRange: [0, 0.6, 1],
                outputRange: [1, 0.3, 0],
              });
            } else if (frame.isEntering) {
              animOpacity = slideAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.5, 1],
              });
            }

            return (
              <Animated.View
                key={`anim_${idx}`}
                style={{
                  position: 'absolute',
                  left: fL,
                  top: fT,
                  width: fW,
                  height: fH,
                  opacity: animOpacity,
                  zIndex: frame.zIndex,
                  borderRadius: frame.borderRadius,
                  overflow: 'hidden',
                  backgroundColor: 'transparent',
                  borderWidth: frame.isMain || frame.isExiting ? 2 : 1,
                  borderColor: frame.isMain || frame.isExiting ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.15)',
                  elevation: frame.isMain ? 20 : 2,
                  transform: [
                    { translateX: animTranslateX },
                    { translateY: animTranslateY },
                    { scaleX: animScaleX },
                    { scaleY: animScaleY },
                  ]
                }}
              >
                <Image
                  source={{ uri: frame.uri }}
                  style={{ width: '100%', height: '100%' }}
                  fadeDuration={0}
                  resizeMode="cover"
                />
              </Animated.View>
            );
          })
        ) : (
          /* ═══ MODO REPOSO: grid estático ═══ */
          <>
            {/* Celdas periféricas */}
            {layout.cells.map((cell, idx) => {
              const photo = cellPhotos[idx];
              if (!photo) return null;
              const uri = photo.localUri || photo.remoteUrl;
              return (
                <View
                  key={`cell_${idx}`}
                  style={[
                    styles.gridCell,
                    {
                      left: `${cell.left + GAP / 2}%`,
                      top: `${cell.top + GAP / 2}%`,
                      width: `${cell.width - GAP}%`,
                      height: `${cell.height - GAP}%`,
                    },
                  ]}
                >
                  <Image source={{ uri }} style={styles.cellImage} resizeMode="cover" />
                </View>
              );
            })}

            {/* Imagen Principal (#1) */}
            <View
              style={[
                styles.mainCell,
                {
                  left: `${layout.main.left + GAP / 2}%`,
                  top: `${layout.main.top + GAP / 2}%`,
                  width: `${layout.main.width - GAP}%`,
                  height: `${layout.main.height - GAP}%`,
                },
              ]}
            >
              <Image source={{ uri: mainUri }} style={styles.mainImage} resizeMode="cover" />
            </View>
          </>
        )}

        {/* Badge NUEVO */}
        {isNew && !transitionFrames && (
          <View style={styles.newBadge} pointerEvents="none">
            <Text style={styles.newBadgeText}>★ NUEVO</Text>
          </View>
        )}

        {/* Nota Post-it */}
        {currentMemory.note && !transitionFrames ? (
          <View style={styles.stickyNote} pointerEvents="none">
            <Text style={styles.stickyNoteText}>{currentMemory.note}</Text>
            {currentMemory.userName && (
              <Text style={styles.stickyNoteAuthor}>- {currentMemory.userName}</Text>
            )}
          </View>
        ) : null}

        {/* Controles táctiles */}
        <TouchableOpacity style={styles.touchLeft} onPress={handlePrev} activeOpacity={1} />
        <TouchableOpacity style={styles.touchRight} onPress={handleNext} activeOpacity={1} />
      </View>
    </SafeAreaView>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  roomTitleContainer: {
    position: 'absolute',
    top: 45,
    left: 45,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: 'rgba(20, 15, 35, 0.85)', // Tono ciruela/azul noche muy profundo
    paddingVertical: 14,
    paddingHorizontal: 35,
    borderRadius: 20, // Curvas suaves, modernas
    borderWidth: 1.5,
    borderColor: '#F3C969', // Dorado Champagne brillante
    shadowColor: '#F3C969', // Resplandor dorado
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  roomTitleText: {
    color: '#FFFFFF', // Blanco puro resaltante
    fontSize: 40,
    fontFamily: Platform.OS === 'ios' ? 'Baskerville' : 'serif',
    fontStyle: 'italic',
    fontWeight: 'bold', // Más grueso para llamar la atención
    letterSpacing: 4, // Separación intermedia
    textTransform: 'uppercase',
    textShadowColor: 'rgba(243, 201, 105, 0.6)', // Aura dorada en el texto
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  gridContainer: {
    flex: 1,
    position: 'relative',
  },
  gridCell: {
    position: 'absolute',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  mainCell: {
    position: 'absolute',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    zIndex: 5,
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  mainImage: {
    width: '100%',
    height: '100%',
  },
  newBadge: {
    position: 'absolute',
    top: 40,
    right: 40,
    backgroundColor: '#FFCC00', // Dorado premium
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E6B800',
    zIndex: 9999,
    elevation: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  newBadgeText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  stickyNote: {
    position: 'absolute',
    bottom: 15,
    right: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Blanco esmerilado
    paddingVertical: 18,
    paddingHorizontal: 25,
    maxWidth: '55%',
    minWidth: 160,
    borderRadius: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#007AFF', // Acento azul
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 9999,
    zIndex: 9999,
    transform: [{ rotate: '-3deg' }], // Ligera inclinación para darle un toque casual y dinámico
  },
  stickyNoteText: {
    color: '#1C1C1E',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  stickyNoteAuthor: {
    color: '#007AFF',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'right',
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  touchLeft: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: '50%',
    zIndex: 10,
  },
  touchRight: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: '50%',
    zIndex: 10,
  },
});
