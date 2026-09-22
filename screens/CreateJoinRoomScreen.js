import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Keyboard, Platform, Button } from 'react-native';
import { collection, addDoc, query, where, getDocs, updateDoc, arrayUnion, doc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import * as ImagePicker from 'expo-image-picker';
import { useCameraPermissions, CameraView } from 'expo-camera';

export default function CreateJoinRoomScreen({ route, navigation }) {
  const [roomName, setRoomName] = useState('');
  const [joinCode, setJoinCode] = useState(route.params?.joinCode || '');
  const [loading, setLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null); // 'create' | 'join' | null
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: '#FFFFFF',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 1,
        borderBottomColor: '#D5C29F',
      },
      headerTintColor: '#3E3832',
      headerTitleStyle: {
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
        fontSize: 22,
        letterSpacing: 1,
        textTransform: 'uppercase',
      },
    });
    
    if (route.params?.joinCode) {
      setExpandedSection('join');
    }
  }, [navigation, route.params?.joinCode]);

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Error', 'Ingresa un nombre para la sala.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      const user = auth.currentUser;
      const newCode = generateRoomCode();

      const roomRef = await addDoc(collection(db, 'rooms'), {
        name: roomName,
        code: newCode,
        members: [user.uid],
        createdAt: new Date(),
      });

      await updateDoc(doc(db, 'users', user.uid), {
        rooms: arrayUnion({ id: roomRef.id, name: roomName })
      });

      Alert.alert('¡Éxito!', `Sala creada. Código para invitar: ${newCode}`);
      navigation.navigate('Room', { roomId: roomRef.id, roomName: roomName });
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (codeToJoin) => {
    const code = typeof codeToJoin === 'string' ? codeToJoin : joinCode;
    
    if (!code.trim() || code.length !== 6) {
      Alert.alert('Error', 'Ingresa un código válido de 6 caracteres.');
      setScanned(false);
      return;
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      const user = auth.currentUser;
      const codeUpper = code.toUpperCase();

      const q = query(collection(db, 'rooms'), where('code', '==', codeUpper));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        Alert.alert('Error', 'No se encontró ninguna sala con ese código.');
        setLoading(false);
        setScanned(false);
        return;
      }

      const roomDoc = querySnapshot.docs[0];
      const roomData = roomDoc.data();

      if (roomData.members.includes(user.uid)) {
        Alert.alert('Aviso', 'Ya perteneces a esta sala.');
        navigation.navigate('Room', { roomId: roomDoc.id, roomName: roomData.name });
        setLoading(false);
        return;
      }

      Alert.alert(
        'Permisos Requeridos',
        'Para unirte a esta sala y poder compartir recuerdos, accederemos a tu cámara y galería. ¿Aceptas?',
        [
          { 
            text: 'Cancelar', 
            style: 'cancel',
            onPress: () => { setLoading(false); setScanned(false); }
          },
          { 
            text: 'Aceptar', 
            onPress: async () => {
              await ImagePicker.requestMediaLibraryPermissionsAsync();
              await ImagePicker.requestCameraPermissionsAsync();

              await updateDoc(doc(db, 'rooms', roomDoc.id), {
                members: arrayUnion(user.uid)
              });

              await updateDoc(doc(db, 'users', user.uid), {
                rooms: arrayUnion({ id: roomDoc.id, name: roomData.name })
              });

              Alert.alert('¡Éxito!', `Te has unido a la sala: ${roomData.name}`);
              navigation.navigate('Room', { roomId: roomDoc.id, roomName: roomData.name });
              setLoading(false);
            }
          }
        ]
      );
      
    } catch (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      setScanned(false);
    }
  };

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned) return;
    setScanned(true);
    
    let code = data;
    if (data.includes('join/')) {
      code = data.split('join/')[1].substring(0, 6);
    } else if (data.length >= 6) {
      code = data.substring(data.length - 6);
    }
    
    setJoinCode(code);
    handleJoinRoom(code);
  };

  const toggleSection = (section) => {
    // Expandimos la interfaz inmediatamente sin esperar permisos
    setExpandedSection(expandedSection === section ? null : section);
    setScanned(false); // Reset scanner when toggling
    
    // Solicitamos permisos en segundo plano si no los tiene
    if (section === 'join' && permission && !permission.granted && requestPermission) {
      requestPermission().catch(err => console.log('Error pidiendo permisos de cámara:', err));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear o Unirse a una Sala</Text>

      {/* SECCIÓN CREAR */}
      <TouchableOpacity 
        style={styles.headerCard} 
        activeOpacity={0.8} 
        onPress={() => toggleSection('create')}
      >
        <Text style={styles.subtitle}>Crear Nueva Sala</Text>
      </TouchableOpacity>

      {expandedSection === 'create' && (
        <View style={styles.expandedContent}>
          <TextInput
            style={styles.input}
            placeholder="Nombre de la Sala"
            placeholderTextColor="#A0968A"
            value={roomName}
            onChangeText={setRoomName}
            editable={!loading}
          />
          {loading ? (
            <ActivityIndicator color="#5C5449" style={{ marginVertical: 10 }} />
          ) : (
            <View style={styles.buttonWrapper}>
              <Button title="Crear Sala" color="#5C5449" onPress={handleCreateRoom} disabled={loading} />
            </View>
          )}
        </View>
      )}

      {/* SECCIÓN UNIRSE */}
      <TouchableOpacity 
        style={[styles.headerCard, { marginTop: 20 }]} 
        activeOpacity={0.8} 
        onPress={() => toggleSection('join')}
      >
        <Text style={styles.subtitle}>Unirse con Código o QR</Text>
      </TouchableOpacity>

      {expandedSection === 'join' && (
        <View style={styles.expandedContent}>
          {permission?.granted ? (
            <View style={styles.scannerContainer}>
              <CameraView
                style={{ flex: 1, width: '100%', height: '100%' }}
                facing="back"
                zoom={zoom}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
              />
              
              {/* Controles de Zoom */}
              <View style={styles.zoomControls}>
                <TouchableOpacity onPress={() => setZoom(z => Math.max(z - 0.1, 0))} style={styles.zoomBtn}>
                  <Text style={styles.zoomBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.zoomLabel}>{Math.round(zoom * 10) + 1}x</Text>
                <TouchableOpacity onPress={() => setZoom(z => Math.min(z + 0.1, 1))} style={styles.zoomBtn}>
                  <Text style={styles.zoomBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.scannerOverlay}>
                <Text style={styles.scannerText}>Apunta al código QR de la sala</Text>
              </View>
            </View>
          ) : (
            <View style={[styles.scannerContainer, { backgroundColor: '#3E3832', padding: 20 }]}>
              <Text style={[styles.errorText, { color: '#FFFFFF', marginBottom: 15 }]}>
                Para usar el escáner, necesitamos acceso a tu cámara.
              </Text>
              <Button title="Activar Cámara" color="#A0968A" onPress={() => requestPermission()} />
            </View>
          )}

          <Text style={styles.orText}>- O INGRESAR CÓDIGO -</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Ej: A4F29X"
            placeholderTextColor="#A0968A"
            value={joinCode}
            onChangeText={setJoinCode}
            autoCapitalize="characters"
            maxLength={6}
            editable={!loading}
          />
          {loading ? (
            <ActivityIndicator color="#5C5449" style={{ marginVertical: 10 }} />
          ) : (
            <View style={styles.buttonWrapper}>
              <Button title="Unirse a Sala" color="#3E3832" onPress={() => handleJoinRoom(joinCode)} disabled={loading} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F5E8D0', // Fondo crema
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '400',
    textAlign: 'center',
    marginBottom: 40,
    color: '#3E3832',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5C29F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
    zIndex: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5C5449',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  expandedContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#D5C29F',
    marginTop: -5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2, // Se asegura de estar debajo del header (que tiene elevation 3) pero encima del fondo
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5C29F',
    backgroundColor: '#FDFCF9',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    color: '#3E3832',
    textAlign: 'center',
    fontSize: 16,
    letterSpacing: 2,
  },
  buttonWrapper: {
    marginTop: 5,
    overflow: 'hidden',
    borderRadius: 8,
  },
  scannerContainer: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 15,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    alignItems: 'center',
  },
  scannerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  orText: {
    textAlign: 'center',
    color: '#A0968A',
    marginBottom: 15,
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  errorText: {
    color: '#B3413B',
    textAlign: 'center',
    marginBottom: 10,
    fontSize: 12,
  },
  zoomControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  zoomBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 15,
  },
  zoomBtnText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: -2,
  },
  zoomLabel: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginHorizontal: 10,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  }
});
