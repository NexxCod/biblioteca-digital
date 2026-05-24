// backend/routes/folderRoutes.js
import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
    createFolder,
    listFolders,
    updateFolder,
    deleteFolder,
    getFolderDetails,
    moveFolder,
    listAllVisibleFolders,
    getFolderBreadcrumbs,
} from '../controllers/folderController.js';

const router = express.Router();

router.post('/', protect, createFolder);
router.get('/', protect, listFolders);

// Árbol completo (para vistas tipo "Mover a…")
router.get('/all', protect, listAllVisibleFolders);

router.patch('/:id/move', protect, moveFolder);

router.get('/:id/path', protect, getFolderBreadcrumbs);

router.put('/:id', protect, updateFolder);
router.delete('/:id', protect, deleteFolder);
router.get('/:id', protect, getFolderDetails);

export default router;
