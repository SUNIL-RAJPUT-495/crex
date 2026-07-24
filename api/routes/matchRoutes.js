import express from 'express';
import { getAllMatches, getLiveMatches, getMatchDetails } from '../controllers/matchController.js';

const router = express.Router();

// Route mappings to Controller methods
router.get('/all', getAllMatches);
router.get('/live', getLiveMatches);
router.get('/:slug', getMatchDetails);

export default router;
