import { ObjectId } from 'mongodb';
import { TaskControls } from '@/lib/svg/controls/task/controls';

export interface ClientTask {
  _id?: ObjectId;
  projectId: ObjectId;
  parentId?: ObjectId;
  name: string;
  description: string;
  position: {
    x: number;
    y: number;
  };
  childrenCount: number;
  descendantCount: number;
  isProjectRoot?: boolean;
  controls?: TaskControls;
}
