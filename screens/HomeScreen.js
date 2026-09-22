import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, Alert, ActivityIndicator, ScrollView, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import { auth, db, storage } from '../firebaseConfig';

export default function HomeScreen({ navigation }) {
  const [image, setImage] = useState(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a la galería.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'Se necesita permiso para acceder a la cámara.');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!image) {
      Alert.alert('Error', 'Por favor, selecciona o toma una foto primero.');
      return;
    }
    if (!note.trim()) {
      Alert.alert('Error', 'Por favor, escribe una nota para la foto.');
      return;
    }

    Keyboard.dismiss();
    setLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("No hay usuario autenticado.");

      // 1. Convertir URI a Blob
      const response = await fetch(image);
      const blob = await response.blob();

      // 2. Subir imagen a Firebase Storage
      const filename = `fotos/${user.uid}/${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);

      // 3. Obtener URL pública
      const downloadURL = await getDownloadURL(storageRef);

      // 4. Guardar datos en Firestore
      await addDoc(collection(db, 'notas_fotos'), {
        userId: user.uid,
        imageUrl: downloadURL,
        note: note,
        createdAt: new Date(),
      });

      Alert.alert('¡Éxito!', 'Tu recuerdo ha sido guardado correctamente.');
      
      // Limpiar formulario
      setImage(null);
      setNote('');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Hubo un problema al subir tu recuerdo: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Nuevo Recuerdo</Text>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.mediaButton} onPress={pickImage} disabled={loading}>
          <Text style={styles.mediaButtonText}>Subir de Galería</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaButton} onPress={takePhoto} disabled={loading}>
          <Text style={styles.mediaButtonText}>Tomar Foto</Text>
        </TouchableOpacity>
      </View>

      {image && (
        <>
          <View style={styles.imageContainer}>
            <Image source={{ uri: image }} style={styles.image} />
          </View>

          <TextInput
            style={styles.input}
            placeholder="Escribe una nota sobre este recuerdo..."
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={4}
            editable={!loading}
          />

          <TouchableOpacity 
            style={[styles.uploadButton, loading && styles.disabledButton]} 
            onPress={handleUpload}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Guardar Recuerdo</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1, 
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    paddingTop: 50,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  mediaButton: {
    backgroundColor: '#6c757d',
    padding: 12,
    borderRadius: 8,
    flex: 0.48,
    alignItems: 'center',
  },
  mediaButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    color: '#adb5bd',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    minHeight: 100,
    textAlignVertical: 'top', // Para Android
  },
  uploadButton: {
    backgroundColor: '#28A745',
    width: '100%',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 30,
  },
  disabledButton: {
    backgroundColor: '#94d3a2',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
