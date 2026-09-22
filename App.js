import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';

// Screens
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import MainScreen from './screens/MainScreen';
import RoomScreen from './screens/RoomScreen';
import CreateJoinRoomScreen from './screens/CreateJoinRoomScreen';
import SlideshowScreen from './screens/SlideshowScreen';
import SlideshowNewScreen from './screens/SlideshowNewScreen';
import CustomDrawer from './components/CustomDrawer';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function DrawerNavigator() {
  return (
    <Drawer.Navigator drawerContent={(props) => <CustomDrawer {...props} />}>
      <Drawer.Screen name="Main" component={MainScreen} options={{ title: 'Inicio' }} />
      <Drawer.Screen name="Room" component={RoomScreen} options={{ title: 'Sala' }} />
      <Drawer.Screen name="CreateJoinRoom" component={CreateJoinRoomScreen} options={{ title: 'Nueva Sala' }} />
    </Drawer.Navigator>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
    });

    return unsubscribe;
  }, []);

  if (isLoading) {
    return null;
  }

  const prefix = Linking.createURL('/');
  
  const linking = {
    prefixes: [prefix, 'recuerdosapp://'],
    config: {
      screens: {
        Drawer: {
          screens: {
            CreateJoinRoom: 'join/:joinCode',
          },
        },
      },
    },
  };

  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking}>
        <Stack.Navigator>
          {user ? (
            <>
              <Stack.Screen name="Drawer" component={DrawerNavigator} options={{ headerShown: false }} />
              <Stack.Screen name="Slideshow" component={SlideshowScreen} options={{ headerShown: false }} />
              <Stack.Screen name="SlideshowNew" component={SlideshowNewScreen} options={{ headerShown: false }} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
              <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Registro' }} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
