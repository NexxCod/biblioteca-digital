// backend/utils/folderPermissions.js
//
// Reglas:
// - admin: puede escribir en cualquier carpeta.
// - docente: si la carpeta es suya O su grupo está asignado a la carpeta.
// - residente: no puede escribir.
// `folder` puede ser un documento Mongoose o un objeto plano (lean).

const getUserGroupIds = (req) =>
  req.userGroupIds ||
  (req.user?.groups || []).map((group) =>
    typeof group === "string" ? group : (group?._id || group)?.toString()
  );

const userCanWriteFolder = (req, folder) => {
  if (!req?.user || !folder) {
    return false;
  }

  if (req.user.role === "admin") {
    return true;
  }

  if (req.user.role === "docente") {
    const ownerId =
      folder.createdBy?._id?.toString() || folder.createdBy?.toString() || null;
    if (ownerId && ownerId === req.user._id.toString()) {
      return true;
    }

    const assignedGroupId =
      folder.assignedGroup?._id?.toString() ||
      folder.assignedGroup?.toString() ||
      null;
    if (assignedGroupId) {
      const userGroupIds = getUserGroupIds(req).filter(Boolean);
      if (userGroupIds.includes(assignedGroupId)) {
        return true;
      }
    }
  }

  return false;
};

export { userCanWriteFolder };
