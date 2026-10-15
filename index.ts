import 'react-native-url-polyfill/auto';
import { enableScreens } from 'react-native-screens';

// Disable native screen fragments to prevent Android Fragment$InstantiationException crashes
enableScreens(false);

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
