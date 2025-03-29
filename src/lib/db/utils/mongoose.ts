import mongoose from 'mongoose';

export const createObjectId = (id: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId => {
  return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
};
