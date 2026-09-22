import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Keyboard, Platform } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';

export default function LoginScreen({ navigation }) {
  const [studentCode, setStudentCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => {
      setErrorMsg('');
    }, 3000);
  };

  const handleLogin = () => {
    Keyboard.dismiss();
    
    if (!studentCode || !password) {
      showError('Por favor, ingrese código y contraseña.');
      return;
    }
    const email = `${studentCode}@recuerdosapp.com`;
    setLoading(true);

    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // La navegación a Home ahora se maneja automáticamente en App.js
      })
      .catch((error) => {
        setLoading(false);
        showError('Credenciales incorrectas.');
      });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Álbum de Recuerdos</Text>
      
      <View style={styles.card}>
        <Text style={styles.subtitle}>Iniciar Sesión</Text>

        <TextInput
          style={styles.input}
          placeholder="Código Estudiantil"
          placeholderTextColor="#A0968A"
          value={studentCode}
          onChangeText={setStudentCode}
          autoCapitalize="none"
          keyboardType="default"
          editable={!loading}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#A0968A"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>¿No tienes cuenta? Regístrate aquí</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 25,
    backgroundColor: '#F5E8D0', // Fondo crema
  },
  title: {
    fontSize: 26,
    fontWeight: '400',
    marginBottom: 30,
    textAlign: 'center',
    color: '#3E3832', // Taupe oscuro
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5C29F',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 25,
    color: '#5C5449',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D5C29F',
    backgroundColor: '#FDFCF9',
    padding: 15,
    marginBottom: 20,
    borderRadius: 8,
    color: '#3E3832',
    textAlign: 'center',
    fontSize: 16,
    letterSpacing: 2,
  },
  button: {
    backgroundColor: '#5C5449', // Botón taupe oscuro
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  linkText: {
    marginTop: 25,
    color: '#A0968A',
    textAlign: 'center',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
  },
  errorText: {
    color: '#B3413B',
    textAlign: 'center',
    marginBottom: 15,
    fontWeight: '600',
  },
});
