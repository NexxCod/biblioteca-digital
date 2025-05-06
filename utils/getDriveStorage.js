// backend/utils/getDriveStorage.js (puedes crear un nuevo archivo para esto)
import { googleDriveClient } from '../config/googleDriveConfig.js';

async function getGoogleDriveStorageQuota() {
  try {
    const res = await googleDriveClient.about.get({
      fields: 'storageQuota',
    });
    return res.data.storageQuota;
  } catch (error) {
    console.error('Error al obtener la cuota de almacenamiento de Google Drive:', error);
    throw error;
  }
}

// Ejemplo de cómo podrías usar esta función (puedes llamarla desde otro módulo)
async function logStorageQuota() {
  try {
    const storageQuota = await getGoogleDriveStorageQuota();
    console.log('Información de la cuota de almacenamiento de Google Drive:');
    console.log('  Espacio total (bytes):', storageQuota.limit);
    console.log('  Espacio usado (bytes):', storageQuota.usage);
    console.log('  Espacio usado en la papelera (bytes):', storageQuota.usageInDriveTrash);
  } catch (error) {
    console.error('No se pudo obtener la cuota de almacenamiento.');
  }
}

// Llama a la función para ver la información (solo para probar, puedes integrarla en tu lógica)
// logStorageQuota();

export { getGoogleDriveStorageQuota };