import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');
  
  LoadSkiaWeb({ locateFile: (file) => `/${file}` })
    .then(() => {
      // Once CanvasKit is loaded and attached to global, we can safely require the router
      require('expo-router/entry');
    })
    .catch((e) => {
      console.error('Failed to load Skia on web:', e);
    });
} else {
  require('expo-router/entry');
}
