import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, RefreshControl } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const ASYNC_STORAGE_KEY = '@mis_recuerdos';

export default function HistoryScreen() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      // 1. Cargar desde la caché local primero para renderizado rápido
      const cachedData = await AsyncStorage.getItem(`${ASYNC_STORAGE_KEY}_${user.uid}`);
      if (cachedData) {
        setMemories(JSON.parse(cachedData));
      }

      // 2. Verificar estado de la red
      const networkState = await Network.getNetworkStateAsync();
      
      if (networkState.isConnected && networkState.isInternetReachable !== false) {
        setIsOffline(false);
        await syncWithFirestore(user.uid);
      } else {
        setIsOffline(true);
      }
    } catch (error) {
      console.log('Error loading memories:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const syncWithFirestore = async (uid) => {
    try {
      const q = query(
        collection(db, 'notas_fotos'),
        where('userId', '==', uid)
        // Nota: orderBy requiere un índice en Firestore, si da error se puede ordenar localmente
      );
      
      const querySnapshot = await getDocs(q);
      const onlineMemories = [];

      // Obtener datos actuales cacheados para no volver a descargar fotos
      const cachedData = await AsyncStorage.getItem(`${ASYNC_STORAGE_KEY}_${uid}`);
      const cachedMemories = cachedData ? JSON.parse(cachedData) : [];

      for (const document of querySnapshot.docs) {
        const data = document.data();
        const docId = document.id;

        // Comprobar si ya existe en la caché
        const existing = cachedMemories.find(m => m.id === docId);

        let localUri = existing ? existing.localUri : null;

        // Si no existe la foto localmente, la descargamos
        if (!localUri && data.imageUrl) {
          const filename = `${docId}.jpg`;
          const fileUri = FileSystem.documentDirectory + filename;
          
          try {
            const { uri } = await FileSystem.downloadAsync(data.imageUrl, fileUri);
            localUri = uri;
          } catch (downloadError) {
            console.log('Error downloading image:', downloadError);
            localUri = data.imageUrl; // Usar online como respaldo si falla
          }
        }

        onlineMemories.push({
          id: docId,
          note: data.note,
          remoteUrl: data.imageUrl,
          localUri: localUri,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : new Date().toISOString(),
        });
      }

      // Ordenar por fecha (más reciente primero)
      onlineMemories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Guardar en caché y actualizar estado
      await AsyncStorage.setItem(`${ASYNC_STORAGE_KEY}_${uid}`, JSON.stringify(onlineMemories));
      setMemories(onlineMemories);

    } catch (error) {
      console.log('Error syncing with Firestore:', error);
      if (error.message.includes('index')) {
         console.log('Falta índice compuesto en Firestore, usando caché.');
      }
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMemories();
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {item.localUri ? (
        <Image source={{ uri: item.localUri }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text>Sin Imagen</Text>
        </View>
      )}
      <View style={styles.noteContainer}>
        <Text style={styles.dateText}>
          {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString()}
        </Text>
        <Text style={styles.noteText}>{item.note}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>Modo Sin Conexión - Mostrando registros guardados</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#007BFF" style={{ marginTop: 50 }} />
      ) : memories.length === 0 ? (
        <Text style={styles.emptyText}>No tienes recuerdos guardados aún.</Text>
      ) : (
        <FlatList
          data={memories}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  offlineBanner: {
    backgroundColor: '#ffc107',
    padding: 10,
    alignItems: 'center',
  },
  offlineText: {
    color: '#000',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
    color: '#6c757d',
  },
  listContainer: {
    padding: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteContainer: {
    padding: 15,
  },
  dateText: {
    fontSize: 12,
    color: '#6c757d',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 16,
    color: '#212529',
  },
});
