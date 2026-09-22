import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { auth, db } from '../firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';

export default function MainScreen({ navigation }) {
  const [hasRooms, setHasRooms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    navigation.setOptions({
      title: 'Inicio',
      headerStyle: {
        backgroundColor: '#FFFFFF', // Blanco puro para diferenciarlo de la app crema
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

    let unsubscribe = () => {};
    const user = auth.currentUser;

    if (user) {
      const docRef = doc(db, 'users', user.uid);
      unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setUserName(data.fullName || 'Estudiante');
          if (data.rooms && data.rooms.length > 0) {
            setHasRooms(true);
          } else {
            setHasRooms(false);
          }
        }
        setLoading(false);
      });
    }

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <View style={styles.container}><Text>Cargando...</Text></View>;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.welcomeText}>¡Hola, {userName}!</Text>

      {!hasRooms ? (
        <View style={styles.emptyState}>
          <Text style={styles.instructionText}>Aún no estás en ninguna sala de recuerdos.</Text>
          <Text style={styles.instructionText}>Crea una nueva sala o únete a una existente para comenzar a compartir.</Text>
          
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => navigation.navigate('CreateJoinRoom')}
          >
            <Text style={styles.primaryButtonText}>Crear o Unirse a Sala</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.activeState}>
          <Text style={styles.instructionText}>Abre el menú lateral (deslizando desde la izquierda) para seleccionar una sala y ver tus recuerdos.</Text>
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
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '400',
    marginBottom: 30,
    color: '#3E3832', // Taupe oscuro
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    letterSpacing: 1,
  },
  emptyState: {
    alignItems: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF', // Blanco
    padding: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5C29F', // Borde arena
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  activeState: {
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5C29F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    width: '100%',
  },
  instructionText: {
    fontSize: 16,
    color: '#5C5449',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  primaryButton: {
    backgroundColor: '#5C5449', // Botón Taupe cálido
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  }
});
