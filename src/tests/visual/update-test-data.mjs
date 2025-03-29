/* global console */
import { connect, disconnect, model, Schema } from 'mongoose';
import { Types } from 'mongoose';

async function updateTestData() {
  try {
    const userId = "67adf5946530a8ca28ca143d"; // Complete user ID
    
    // Connect to MongoDB
    await connect('mongodb://admin:devpassword@localhost:27017/ai_project_planner?authSource=admin');
    
    // Define Project model
    const ProjectSchema = new Schema({
      name: String,
      description: String,
      userId: Types.ObjectId,
      rootTaskId: Types.ObjectId
    });
    
    const ProjectModel = model('Project', ProjectSchema);
    
    // Update project userId
    const result = await ProjectModel.findByIdAndUpdate(
      '67b59ed0cf216ae81de6acc2',
      { userId: new Types.ObjectId(userId) },
      { new: true }
    );

    if (result) {
      console.log('Project updated successfully:', {
        projectId: result._id.toString(),
        userId: result.userId.toString()
      });
    } else {
      console.log('Project not found');
    }

  } catch (error) {
    console.error('Failed to update test data:', error);
  } finally {
    await disconnect();
  }
}

updateTestData();
