// backend/utils/folderPermissions.js
//
// Reglas (escritura = mismas reglas que lectura):
// - admin: puede escribir en cualquier carpeta.
// - docente: si la carpeta es suya O su grupo está asignado a la carpeta.
// - residente: si la carpeta es pública (assignedGroup vacío) O su grupo está asignado a la carpeta.
// `folder` puede ser un documento Mongoose o un objeto plano (lean).

const getUserGroupIds = (req) =>
  req.userGroupIds ||
  (req.user?.groups || []).map((group) =>
    typeof group === "string" ? group : (group?._id || group)?.toString()
  );

const getFolderAssignedGroupId = (folder) =>
  folder.assignedGroup?._id?.toString() ||
  folder.assignedGroup?.toString() ||
  null;

const userCanWriteFolder = (req, folder) => {
  if (!req?.user || !folder) {
    return false;
  }

  if (req.user.role === "admin") {
    return true;
  }

  const assignedGroupId = getFolderAssignedGroupId(folder);
  const userGroupIds = getUserGroupIds(req).filter(Boolean);

  if (req.user.role === "docente") {
    const ownerId =
      folder.createdBy?._id?.toString() || folder.createdBy?.toString() || null;
    if (ownerId && ownerId === req.user._id.toString()) {
      return true;
    }

    if (assignedGroupId && userGroupIds.includes(assignedGroupId)) {
      return true;
    }
  }

  if (req.user.role === "residente") {
    if (!assignedGroupId) {
      return true;
    }
    if (userGroupIds.includes(assignedGroupId)) {
      return true;
    }
  }

  return false;
};

export { userCanWriteFolder };
