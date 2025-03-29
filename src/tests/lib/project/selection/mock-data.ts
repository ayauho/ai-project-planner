/**
 * Mock data for project selection tests
 */

import mongoose from 'mongoose';

export const mockProjects = [
  {
    _id: new mongoose.Schema.Types.ObjectId('507f1f77bcf86cd799439011'),
    userId: new mongoose.Schema.Types.ObjectId('507f1f77bcf86cd799439020'),
    name: "Project A",
    description: "Description A",
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-10')
  },
  {
    _id: new mongoose.Schema.Types.ObjectId('507f1f77bcf86cd799439012'),
    userId: new mongoose.Schema.Types.ObjectId('507f1f77bcf86cd799439020'),
    name: "Project B",
    description: "Description B",
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-05')
  },
  {
    _id: new mongoose.Schema.Types.ObjectId('507f1f77bcf86cd799439013'),
    userId: new mongoose.Schema.Types.ObjectId('507f1f77bcf86cd799439020'),
    name: "Project C",
    description: "Description C",
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03')
  }
];
