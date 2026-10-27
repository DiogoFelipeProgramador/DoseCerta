// Medication photos. The camera saves them in the cache folder, which the system may clean when
// space runs low, so each photo is copied to the app's documents. The cloud backup keeps a copy
// in Supabase Storage (see src/services/supabase.ts) so it comes back on a new phone.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

const pastaFotos = () => {
  const pasta = new Directory(Paths.document, 'fotos');
  if (!pasta.exists) pasta.create({ idempotent: true });
  return pasta;
};

/** Copies a photo taken by the camera to the app's own folder. Returns the uri to save. */
export const guardarFoto = async (uri: string | null | undefined): Promise<string | null> => {
  if (!uri || Platform.OS === 'web') return uri ?? null;
  try {
    const pasta = pastaFotos();
    if (uri.startsWith(pasta.uri)) return uri;
    const destino = new File(pasta, `foto-${Date.now()}.jpg`);
    await new File(uri).copy(destino);
    return destino.uri;
  } catch (e) {
    console.warn('Não foi possível guardar a foto, usando a original:', e);
    return uri;
  }
};

/** Photo contents, for the upload */
export const lerFoto = (uri: string): Promise<ArrayBuffer> => new File(uri).arrayBuffer();

/** Downloads a photo of the backup into the app's folder and returns its uri */
export const baixarFoto = async (url: string, medicamentoId: string): Promise<string> => {
  const destino = new File(pastaFotos(), `${medicamentoId}-${Date.now()}.jpg`);
  const arquivo = await File.downloadFileAsync(url, destino, { idempotent: true });
  return arquivo.uri;
};
