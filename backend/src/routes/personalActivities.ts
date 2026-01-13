import { Router } from 'express';
import * as personalActivitiesController from '../controllers/personalActivitiesController.js';

const router = Router();

router.get('/', personalActivitiesController.getActivities);
router.post('/', personalActivitiesController.createActivity);
router.put('/:id', personalActivitiesController.updateActivity);
// Route specifically for toggling active if client prefers, or can use generic PUT
router.patch('/:id/toggle', personalActivitiesController.toggleActive);
router.delete('/:id', personalActivitiesController.deleteActivity);

export default router;
