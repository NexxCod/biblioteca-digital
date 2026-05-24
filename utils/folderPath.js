import Folder from "../models/Folder.js";

// Devuelve breadcrumb desde la raíz hasta la carpeta dada.
const getFolderPath = async (folderId) => {
  if (!folderId) return [];
  const path = [];
  let current = folderId;
  const seen = new Set();
  while (current) {
    const key = String(current);
    if (seen.has(key)) break;
    seen.add(key);
    const folder = await Folder.findById(current)
      .select("name parentFolder")
      .lean();
    if (!folder) break;
    path.push({ _id: folder._id, name: folder.name });
    current = folder.parentFolder || null;
  }
  return path.reverse();
};

// Devuelve IDs de carpetas ancestro (incluyendo la propia)
const getAncestorFolderIds = async (folderId) => {
  const path = await getFolderPath(folderId);
  return path.map((p) => String(p._id));
};

export { getFolderPath, getAncestorFolderIds };
