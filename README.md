# 📸 RecuerdosApp

**RecuerdosApp** es una aplicación móvil colaborativa diseñada para capturar y compartir momentos especiales en eventos. Los usuarios pueden crear salas privadas, invitar a sus amigos mediante códigos o códigos QR, y construir una galería de recuerdos compartida en tiempo real con una estética elegante y formal.

---

## ✨ Características Principales

- 🔐 **Autenticación Segura:** Registro e inicio de sesión gestionado a través de Firebase Auth.
- 🏠 **Salas Privadas (Rooms):** Creación de salas exclusivas para eventos, las cuales generan un código único de 6 dígitos.
- 📷 **Escáner QR Integrado:** Únete a las salas al instante escaneando el código QR del evento usando la cámara de tu dispositivo (incluye controles de zoom).
- 🖼️ **Galería Colaborativa:** Todos los miembros de la sala pueden subir fotos y agregarles pequeñas notas o dedicatorias.
- ⚡ **Carga Progresiva (Lazy Loading):** Sistema de visualización ultra rápido que carga las miniaturas al instante mientras descarga y almacena en caché las imágenes de alta resolución en segundo plano.
- 🎨 **Diseño Elegante:** Interfaz cuidadosamente diseñada con paleta de colores crema (`#F5E8D0`), blanco puro y detalles en marrón taupe (`#5C5449`), complementada con tipografías clásicas (Serif/Didot).

---

## 🛠️ Tecnologías y Herramientas

- **Framework:** [React Native](https://reactnative.dev/) (con [Expo SDK](https://expo.dev/))
- **Backend as a Service:** [Firebase](https://firebase.google.com/) (Firestore para la base de datos, Storage para las imágenes, Auth para los usuarios).
- **Navegación:** React Navigation (Stack y Drawer).
- **Hardware/Cámara:** `expo-camera` para escanear QRs y `expo-image-picker` para acceder a la galería.

---

## 🚀 Instalación y Desarrollo Local

Sigue estos pasos para correr el proyecto en tu entorno local:

### 1. Prerrequisitos
- Node.js instalado.
- Cuenta en Expo (`npm install -g eas-cli`).
- Aplicación de **Expo Go** instalada en tu dispositivo físico (o un emulador configurado).

### 2. Clonar el Repositorio
```bash
git clone https://github.com/FMeyliYC/recuerdos.git
cd recuerdos
```

### 3. Instalar Dependencias
```bash
npm install
```

### 4. Configurar Firebase
Asegúrate de tener (o crear) el archivo `firebaseConfig.js` en la raíz de tu proyecto con las credenciales de tu proyecto de Firebase:
```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

### 5. Iniciar la App (Modo Desarrollo)
```bash
npx expo start
```
Escanea el código QR que aparece en la terminal con tu teléfono o presiona `a` para abrir en Android y `i` para iOS.

---

## 📦 Compilación para Producción (APK/AAB)

Este proyecto está configurado para ser construido utilizando **EAS Build**.

1. Iniciar sesión en Expo:
   ```bash
   eas login
   ```
2. Para compilar un APK local instalable para pruebas:
   ```bash
   eas build -p android --profile preview
   ```
3. Para compilar la versión oficial para la Google Play Store (App Bundle `.aab`):
   ```bash
   eas build -p android --profile production
   ```

*(Nota: También puedes usar `npx expo prebuild` y compilar localmente con Gradle si tienes el Android SDK configurado en tu máquina).*

---
*Repositorio privado administrado por @FMeyliYC*
