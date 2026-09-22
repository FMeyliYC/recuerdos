import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TouchableHighlight, Button, Image, TextInput, Alert, ActivityIndicator, FlatList, Keyboard, RefreshControl, Modal, useWindowDimensions, Platform, Animated } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Network from 'expo-network';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { auth, db, storage } from '../firebaseConfig';
import * as Linking from 'expo-linking';

const ASYNC_STORAGE_PREFIX = '@sala_recuerdos_';

export default function RoomScreen({ route, navigation }) {
  const { roomId, roomName } = route.params;

  // Estados del Formulario
  const [image, setImage] = useState(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  // Estados del Historial
  const [memories, setMemories] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  // Estado del Modal QR
  const [qrVisible, setQrVisible] = useState(false);
  const [roomCode, setRoomCode] = useState(null);
  const qrRef = useRef(null);

  // Estado del Menú de Presentación
  const [presentationModalVisible, setPresentationModalVisible] = useState(false);
  const [slideshowInterval, setSlideshowInterval] = useState(5);
  const [presentationType, setPresentationType] = useState('classic');
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Estado para el aviso temporal (Toast Animado)
  const [toastMessage, setToastMessage] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const showToast = (message) => {
    setToastMessage(message);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      })
    ]).start();

    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setToastMessage(null);
        scaleAnim.setValue(0.8); // reset scale
      });
    }, 2500);
  };

  useEffect(() => {
    navigation.setOptions({ 
      title: roomName,
      headerStyle: {
        backgroundColor: '#FFFFFF', // Blanco puro para diferenciar de la app crema
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 1,
        borderBottomColor: '#D5C29F',
      },
      headerTintColor: '#3E3832', // Color de flecha de retroceso y título
      headerTitleStyle: {
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
        fontSize: 22,
        letterSpacing: 1,
        textTransform: 'uppercase',
      },
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 5 }}>
          {memories.length > 0 && (
            <View style={{ marginRight: 10 }}>
              <Button 
                title="▶ PRES." 
                color="#5C5449" 
                onPress={() => setPresentationModalVisible(true)} 
              />
            </View>
          )}
          <View style={{ marginRight: 10 }}>
            <Button 
              title="QR" 
              color="#5C5449" 
              onPress={() => setQrVisible(true)} 
            />
          </View>
        </View>
      )
    });
    loadMemories();
    fetchRoomCode();
  }, [roomId, memories.length]);

  const fetchRoomCode = async () => {
    try {
      const roomDoc = await getDoc(doc(db, 'rooms', roomId));
      if (roomDoc.exists()) {
        setRoomCode(roomDoc.data().code);
      }
    } catch (e) {
      console.log('Error al buscar código de sala', e);
    }
  };

  // ================== LOGICA DEL HISTORIAL ==================
  const loadMemories = async () => {
    try {
      const cachedData = await AsyncStorage.getItem(`${ASYNC_STORAGE_PREFIX}${roomId}`);
      if (cachedData) {
        setMemories(JSON.parse(cachedData));
      }

      const networkState = await Network.getNetworkStateAsync();
      
      if (networkState.isConnected && networkState.isInternetReachable !== false) {
        setIsOffline(false);
        await syncWithFirestore();
      } else {
        setIsOffline(true);
      }
    } catch (error) {
      console.log('Error loading memories:', error);
    } finally {
      setLoadingHistory(false);
      setRefreshing(false);
    }
  };

  const syncWithFirestore = async () => {
    try {
      const q = query(collection(db, 'notas_fotos'), where('roomId', '==', roomId));
      const querySnapshot = await getDocs(q);
      const onlineMemories = [];

      const cachedData = await AsyncStorage.getItem(`${ASYNC_STORAGE_PREFIX}${roomId}`);
      const cachedMemories = cachedData ? JSON.parse(cachedData) : [];

      // Limitamos a 50 para no colapsar la memoria en salas muy grandes
      const docs = querySnapshot.docs.sort((a, b) => {
        const dateA = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : new Date();
        const dateB = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : new Date();
        return dateB - dateA;
      }).slice(0, 50);

      const toDownload = [];

      // PASO 1: Cargar la lista inmediatamente
      for (const document of docs) {
        const data = document.data();
        const docId = document.id;

        const existing = cachedMemories.find(m => m.id === docId);
        let localUri = existing ? existing.localUri : null;

        // Si no está descargada, mostramos la URL remota para que cargue asíncronamente
        // y anotamos que hay que descargarla al almacenamiento local.
        if (!localUri && data.imageUrl) {
          localUri = data.imageUrl; 
          toDownload.push({ docId, remoteUrl: data.imageUrl });
        }

        onlineMemories.push({
          id: docId,
          note: data.note,
          remoteUrl: data.imageUrl,
          localUri: localUri, // Podría ser file:// o http:// temporalmente
          userName: data.userName || 'Usuario',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        });
      }

      // Mostramos las fotos en pantalla INMEDIATAMENTE
      setMemories(onlineMemories);
      await AsyncStorage.setItem(`${ASYNC_STORAGE_PREFIX}${roomId}`, JSON.stringify(onlineMemories));

      // PASO 2: Descargar físicamente los archivos faltantes en segundo plano
      if (toDownload.length > 0) {
        downloadMissingImages(toDownload);
      }

    } catch (error) {
      console.log('Error syncing with Firestore:', error);
    }
  };

  const downloadMissingImages = async (imagesToDownload) => {
    for (const item of imagesToDownload) {
      const filename = `${item.docId}.jpg`;
      const fileUri = FileSystem.documentDirectory + filename;
      
      try {
        const { uri } = await FileSystem.downloadAsync(item.remoteUrl, fileUri);
        
        // Reemplazar la URL web por la ruta local file:// de forma transparente
        setMemories(prevMemories => {
          const newMemories = prevMemories.map(m => 
            m.id === item.docId ? { ...m, localUri: uri } : m
          );
          // Actualizar la caché guardada
          AsyncStorage.setItem(`${ASYNC_STORAGE_PREFIX}${roomId}`, JSON.stringify(newMemories)).catch(() => {});
          return newMemories;
        });
      } catch (e) {
        console.log('Error descargando imagen en segundo plano:', e);
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMemories();
  };

  // ================== LOGICA DE SUBIDA ==================
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Error', 'Permiso denegado.');
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Error', 'Permiso denegado.');
    let result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const handleUpload = async () => {
    if (!image) return Alert.alert('Error', 'Selecciona una foto.');

    Keyboard.dismiss();
    setUploading(true);

    try {
      const user = auth.currentUser;
      
      const blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function() {
          resolve(xhr.response);
        };
        xhr.onerror = function(e) {
          reject(new TypeError('Error en la red al convertir la imagen.'));
        };
        xhr.responseType = 'blob';
        xhr.open('GET', image, true);
        xhr.send(null);
      });
      
      const filename = `salas/${roomId}/${user.uid}_${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // Obtener el nombre real del usuario desde Firestore
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const realUserName = userDoc.exists() ? (userDoc.data().fullName || 'Usuario') : 'Usuario';

      await addDoc(collection(db, 'notas_fotos'), {
        roomId: roomId,
        userId: user.uid,
        userName: realUserName,
        imageUrl: downloadURL,
        note: note,
        createdAt: new Date(),
      });

      setImage(null);
      setNote('');
      
      // Mostrar aviso animado en el centro
      showToast('Recuerdo guardado con éxito');
      
      loadMemories(); // Recargar historial de la sala
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setUploading(false);
    }
  };

  // ================== COMPARTIR QR ==================
  const shareQRCode = async () => {
    if (!qrRef.current) return;
    
    try {
      // Capturamos el componente completo (Título + QR + Código) como imagen
      const uri = await qrRef.current.capture();

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Compartir QR de ${roomName}`,
        });
      } else {
        Alert.alert('Aviso', 'Compartir no está disponible en este dispositivo.');
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo generar la imagen para compartir.');
    }
  };

  // ================== RENDERIZADO ==================
  const renderItem = ({ item }) => (
    <View style={[styles.card, { maxWidth: isLandscape ? '23%' : '48%' }]}>
      {item.localUri ? (
        <Image source={{ uri: item.localUri }} style={styles.cardImage} />
      ) : (
        <View style={[styles.cardImage, styles.imagePlaceholder]}><Text>Sin Imagen</Text></View>
      )}
      <View style={styles.noteContainer}>
        <Text style={styles.dateText}>{new Date(item.createdAt).toLocaleDateString()} - {item.userName || 'Usuario'}</Text>
        {item.note ? <Text style={styles.noteText}>{item.note}</Text> : null}
      </View>
    </View>
  );

  const headerView = (
    <View style={styles.uploadSection}>
      
      {!isLandscape && (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.mediaButton} onPress={pickImage} disabled={uploading}>
            <Text style={styles.mediaButtonText}>Subir de Galería</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaButton} onPress={takePhoto} disabled={uploading}>
            <Text style={styles.mediaButtonText}>Tomar Foto</Text>
          </TouchableOpacity>
        </View>
      )}

      {image && (
        <View style={styles.formContainer}>
          <Image source={{ uri: image }} style={styles.previewImage} />
          <TextInput
            style={styles.input}
            placeholder="Nota para la sala..."
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            editable={!uploading}
          />
          <TouchableOpacity style={[styles.uploadButton, uploading && styles.disabledButton]} onPress={handleUpload} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Compartir en la Sala</Text>}
          </TouchableOpacity>
        </View>
      )}

      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Modo Offline - Sala {roomName}</Text>
        </View>
      )}
      <Text style={styles.feedTitle}>Recuerdos de la Sala</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={memories}
        key={isLandscape ? 4 : 2} // Necesario al cambiar numColumns dinámicamente
        numColumns={isLandscape ? 4 : 2}
        columnWrapperStyle={styles.columnWrapper}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={headerView}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !loadingHistory && <Text style={styles.emptyText}>La sala está vacía. ¡Sé el primero en compartir!</Text>
        }
      />


      <Modal visible={qrVisible} transparent={true} animationType="fade">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            {roomCode ? (
              <ViewShot ref={qrRef} options={{ format: "png", quality: 1.0 }} style={styles.captureContainer}>
                <Text style={styles.modalTitle}>Sala: {roomName}</Text>
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={Linking.createURL(`join/${roomCode}`)}
                    size={200}
                  />
                  <Text style={styles.qrCodeText}>Código: {roomCode}</Text>
                </View>
              </ViewShot>
            ) : (
              <ActivityIndicator size="large" color="#007BFF" />
            )}
            <Text style={styles.modalHelp}>Escanea este QR o usa el enlace directo para unirte a la sala.</Text>
            
            <View style={styles.modalButtonsRow}>
              <View style={{ flex: 0.45 }}>
                <Button 
                  title="Compartir" 
                  color="#5C5449" 
                  onPress={shareQRCode} 
                />
              </View>
              
              <View style={{ flex: 0.45 }}>
                <Button 
                  title="Cerrar" 
                  color="#A0968A" 
                  onPress={() => setQrVisible(false)} 
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
      
      <Modal visible={presentationModalVisible} transparent={true} animationType="slide">
        <View style={styles.modalBackground}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Presentación</Text>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={[styles.modalHelp, { flex: 1, marginBottom: 0 }]}>Tiempo por foto:</Text>
              <View style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 0.3 }}>
                  <Button 
                    title="<" 
                    color="#5C5449" 
                    onPress={() => setSlideshowInterval(prev => Math.max(1, prev - 1))} 
                  />
                </View>
                
                <Text style={{ fontSize: 18, fontWeight: 'bold', flex: 0.4, textAlign: 'center', color: '#3E3832' }}>{slideshowInterval}s</Text>
                
                <View style={{ flex: 0.3 }}>
                  <Button 
                    title=">" 
                    color="#5C5449" 
                    onPress={() => setSlideshowInterval(prev => prev + 1)} 
                  />
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25 }}>
              <Text style={[styles.modalHelp, { flex: 1, marginBottom: 0 }]}>Estilo:</Text>
              <View style={{ flex: 1.5, flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 0.48 }}>
                  <Button 
                    title="Clásico" 
                    color={presentationType === 'classic' ? '#5C5449' : '#C8C1B5'} 
                    onPress={() => setPresentationType('classic')} 
                  />
                </View>
                <View style={{ flex: 0.48 }}>
                  <Button 
                    title="Nuevo" 
                    color={presentationType === 'new' ? '#5C5449' : '#C8C1B5'} 
                    onPress={() => setPresentationType('new')} 
                  />
                </View>
              </View>
            </View>

            <View style={styles.modalButtonsRow}>
              <View style={{ flex: 0.45 }}>
                <Button 
                  title="Iniciar" 
                  color="#5C5449" 
                  onPress={() => {
                    setPresentationModalVisible(false);
                    const screenName = presentationType === 'new' ? 'SlideshowNew' : 'Slideshow';
                    navigation.navigate(screenName, { 
                      roomId: roomId, 
                      roomName: roomName, 
                      memories: memories, 
                      interval: slideshowInterval || 5,
                      type: presentationType 
                    });
                  }} 
                />
              </View>
              
              <View style={{ flex: 0.45 }}>
                <Button 
                  title="Cancelar" 
                  color="#A0968A" 
                  onPress={() => setPresentationModalVisible(false)} 
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
      
      {toastMessage && (
        <View style={styles.toastOverlay} pointerEvents="none">
          <Animated.View style={[styles.toastContainerAnimated, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
            <Text style={styles.toastTextAnimated}>{toastMessage}</Text>
          </Animated.View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5E8D0', // Fondo Crema Elegante
  },
  listContainer: {
    padding: 20,
  },
  uploadSection: {
    marginBottom: 30,
  },
  roomTitle: {
    fontSize: 26,
    fontWeight: '400',
    marginBottom: 20,
    textAlign: 'center',
    color: '#3E3832', // Gris cálido/Marrón oscuro
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  mediaButton: {
    backgroundColor: '#FFFFFF', // Blanco puro sobre fondo crema
    borderWidth: 1,
    borderColor: '#D5C29F',
    padding: 14,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  mediaButtonText: {
    color: '#5C5449', 
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  formContainer: {
    backgroundColor: '#FFFFFF', // Blanco
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#D5C29F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    marginBottom: 20,
    resizeMode: 'cover',
  },
  input: {
    backgroundColor: '#FDFCF9',
    borderWidth: 1,
    borderColor: '#D5C29F',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 16,
    color: '#3E3832',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  uploadButton: {
    backgroundColor: '#5C5449', // Tono taupe/carbón cálido para destacar
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#5C5449',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#C8C1B5',
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonText: {
    color: '#FFFFFF', // Texto blanco sobre taupe
    fontWeight: '600',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  smallButtonText: {
    color: '#3E3832',
    fontWeight: 'bold',
    fontSize: 14,
  },
  feedTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#3E3832',
    marginTop: 20,
    marginBottom: 25,
    paddingBottom: 12,
    textAlign: 'center',
    letterSpacing: 3,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: '#D5C29F',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Tarjetas blancas
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
    marginHorizontal: 5,
    borderWidth: 1,
    borderColor: '#EAE5D9',
  },
  cardImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    backgroundColor: '#F5E8D0',
    justifyContent: 'center',
    alignItems: 'center',
    height: 180,
  },
  noteContainer: {
    padding: 15,
    backgroundColor: '#FFFFFF',
  },
  dateText: {
    fontSize: 10,
    color: '#A0968A',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  noteText: {
    fontSize: 15,
    color: '#4A4238',
    fontStyle: 'italic',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  offlineBanner: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5C29F',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  offlineText: {
    color: '#5C5449',
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
    color: '#A0968A',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  headerButton: {
    marginRight: 15,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5C29F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerButtonText: {
    color: '#5C5449',
    fontWeight: 'bold',
  },
  modalBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)', // Oscuro para que resalte el modal crema
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#F5E8D0', // Fondo crema
    width: '85%',
    padding: 25,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D5C29F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '400',
    marginBottom: 25,
    textAlign: 'center',
    color: '#3E3832',
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  captureContainer: {
    backgroundColor: '#FFFFFF', // Blanco puro para buen contraste QR
    padding: 20,
    alignItems: 'center',
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D5C29F',
  },
  qrWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  qrCodeText: {
    marginTop: 15,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
    color: '#3E3832',
  },
  modalHelp: {
    textAlign: 'center',
    color: '#706558',
    marginBottom: 20,
    fontSize: 13,
    marginTop: 15,
    letterSpacing: 0.5,
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  shareButton: {
    backgroundColor: '#5C5449', // Taupe oscuro
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    flex: 0.45,
    alignItems: 'center',
  },
  modalCloseButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5C29F',
    paddingVertical: 12,
    paddingHorizontal: 15,
    borderRadius: 8,
    flex: 0.45,
    alignItems: 'center',
  },
  fabButton: {
    position: 'absolute',
    bottom: 25,
    right: 20,
    backgroundColor: '#5C5449',
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 1,
  },
  intervalButtonsRow: { 
    flexDirection: 'row',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginVertical: 20,
    paddingHorizontal: 10,
  },
  settingLabel: {
    fontSize: 15,
    color: '#3E3832',
    fontWeight: '500',
  },
  settingInput: {
    borderWidth: 1,
    borderColor: '#D5C29F',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    width: 80,
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
    color: '#3E3832',
  },
  modalSmallButton: {
    backgroundColor: '#F5E8D0',
    borderWidth: 1,
    borderColor: '#D5C29F',
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSmallButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#5C5449',
  },
  modalStyleButton: {
    flex: 0.48,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D5C29F',
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalStyleButtonActive: {
    backgroundColor: '#5C5449',
    borderColor: '#5C5449',
  },
  modalStyleButtonText: {
    color: '#5C5449',
    fontWeight: '600',
  },
  modalStyleButtonTextActive: {
    color: '#FFFFFF',
  },
  toastOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  toastContainerAnimated: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5C29F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    alignItems: 'center',
  },
  toastTextAnimated: {
    color: '#5C5449',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    textAlign: 'center',
  }
});
