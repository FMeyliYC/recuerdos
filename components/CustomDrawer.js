import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { auth, db } from '../firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

export default function CustomDrawer(props) {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};

    const user = auth.currentUser;
    if (user) {
      const docRef = doc(db, 'users', user.uid);
      unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
        setLoading(false);
      }, (error) => {
        console.log("Error fetching user data:", error);
        // Alert.alert("Error de Base de Datos", error.message); // Opcional, pero util para depurar
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => unsubscribe();
  }, []);

  const handleLogout = () => {
    signOut(auth).catch((error) => console.log('Logout error', error));
  };

  return (
    <View style={styles.container}>
      {/* Header del Drawer */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {userData?.fullName ? userData.fullName.charAt(0).toUpperCase() : 'U'}
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <View>
            <Text style={styles.nameText} numberOfLines={1}>
              {userData?.fullName || 'Estudiante'}
            </Text>
            <Text style={styles.codeText}>
              Código: {userData?.studentCode || 'N/A'}
            </Text>
          </View>
        )}
      </View>

      {/* Contenido del Drawer (Salas) */}
      <DrawerContentScrollView {...props}>
        <View style={styles.roomsContainer}>
          <Text style={styles.sectionTitle}>TUS SALAS</Text>
          
          {userData?.rooms && userData.rooms.length > 0 ? (
            userData.rooms.map((room, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.roomItem}
                onPress={() => props.navigation.navigate('Room', { roomId: room.id, roomName: room.name })}
              >
                <Text style={styles.roomItemText}># {room.name}</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.noRoomsText}>No perteneces a ninguna sala.</Text>
          )}

          <TouchableOpacity 
            style={styles.addRoomButton}
            onPress={() => props.navigation.navigate('CreateJoinRoom')}
          >
            <Text style={styles.addRoomButtonText}>+ Crear / Unirse a Sala</Text>
          </TouchableOpacity>
        </View>
      </DrawerContentScrollView>

      {/* Footer del Drawer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Fondo blanco para el menú
  },
  header: {
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#F5E8D0', // Cabecera crema
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#D5C29F',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 8, // Cuadrado redondeado elegante
    backgroundColor: '#5C5449', // Taupe oscuro
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  nameText: {
    color: '#3E3832', // Texto oscuro formal
    fontSize: 18,
    fontWeight: 'bold',
    maxWidth: 150,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  codeText: {
    color: '#5C5449',
    fontSize: 14,
    marginTop: 4,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0D8C8',
    backgroundColor: '#FDFCF9',
  },
  logoutButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5C29F',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutText: {
    color: '#5C5449',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 1,
  },
  roomsContainer: {
    padding: 15,
  },
  sectionTitle: {
    fontSize: 13,
    color: '#A0968A',
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  roomItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE5D9',
  },
  roomItemText: {
    fontSize: 16,
    color: '#3E3832',
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  noRoomsText: {
    color: '#A0968A',
    fontStyle: 'italic',
    marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  addRoomButton: {
    marginTop: 25,
    backgroundColor: '#5C5449', // Taupe oscuro
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#5C5449',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  addRoomButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
