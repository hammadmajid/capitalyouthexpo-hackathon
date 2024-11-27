import * as SecureStore from 'expo-secure-store';
import { CredentialVault } from './vault';
const key = 'hsm.session.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'pk.hsm.session',
};
export const vault = new CredentialVault({
  read: () => SecureStore.getItemAsync(key, options),
  write: (value) => SecureStore.setItemAsync(key, value, options),
  remove: () => SecureStore.deleteItemAsync(key, options),
});
