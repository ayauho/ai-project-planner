/* global console */
import { connect, disconnect } from 'mongoose';
import { Types } from 'mongoose';

async function createTestData() {
  try {
    // Connect to MongoDB
    await connect('mongodb://admin:devpassword@localhost:27017/ai_project_planner?authSource=admin');

    const userId = new Types.ObjectId();
    const longTitle = "This is a very long task title that should definitely wrap across multiple lines in the visualization";
    const longDescription = "This is a very detailed task description that contains multiple sentences and should definitely wrap across multiple lines when rendered in the task rectangle visualization. We want to ensure proper handling of long text.";

    const db = await connect('mongodb://admin:devpassword@localhost:27017/ai_project_planner?authSource=admin');
    const ProjectModel = db.model('Project', {
      name: String,
      description: String,
      userId: Types.ObjectId,
      rootTaskId: Types.ObjectId
    });

    const TaskModel = db.model('Task', {
      projectId: Types.ObjectId,
      name: String,
      description: String,
      position: {
        x: Number,
        y: Number
      },
      childrenCount: Number,
      descendantCount: Number
    });

    // Create project
    const project = await ProjectModel.create({
      name: longTitle,
      description: longDescription,
      userId: userId
    });

    // Create task with long text
    const task = await TaskModel.create({
      projectId: project._id,
      name: longTitle,
      description: longDescription,
      position: { x: 0, y: 0 },
      childrenCount: 0,
      descendantCount: 0
    });

    // Create normal task
    const normalTask = await TaskModel.create({
      projectId: project._id,
      name: "Normal Task",
      description: "Short description",
      position: { x: 0, y: 0 },
      childrenCount: 0,
      descendantCount: 0
    });

    // Set root task
    await ProjectModel.findByIdAndUpdate(project._id, {
      rootTaskId: task._id
    });

    console.log('Test data created successfully:', {
      projectId: project._id.toString(),
      taskId: task._id.toString(),
      normalTaskId: normalTask._id.toString()
    });

  } catch (error) {
    console.error('Failed to create test data:', error);
  } finally {
    await disconnect();
  }
}

createTestData();
