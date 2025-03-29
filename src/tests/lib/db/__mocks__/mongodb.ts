const mockAdmin = {
  ping: jest.fn().mockResolvedValue({ ok: 1 })
};

const mockDb = {
  admin: jest.fn().mockReturnValue(mockAdmin),
  collection: jest.fn()
};

const mockClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  db: jest.fn().mockReturnValue(mockDb)
};

export const ObjectId = jest.fn().mockImplementation((id) => ({ 
  _id: id || 'mock_id',
  toHexString: () => id || 'mock_id',
  toString: () => id || 'mock_id',
  equals: () => true,
  getTimestamp: () => new Date(),
  toJSON: () => ({ id: id || 'mock_id' }),
  inspect: () => id || 'mock_id'
}));

const MongoClient = jest.fn().mockImplementation(() => mockClient);

export { MongoClient };

export const mocks = {
  client: mockClient,
  db: mockDb,
  admin: mockAdmin,
  collection: mockDb.collection
};

// Reset all mocks between tests
afterEach(() => {
  jest.clearAllMocks();
  mockAdmin.ping.mockResolvedValue({ ok: 1 });
  mockDb.collection.mockReturnValue({
    insertOne: jest.fn().mockResolvedValue({
      acknowledged: true,
      insertedId: new ObjectId()
    }),
    findOne: jest.fn().mockResolvedValue(null),
    updateOne: jest.fn().mockResolvedValue({
      acknowledged: true,
      modifiedCount: 1,
      upsertedId: null,
      upsertedCount: 0,
      matchedCount: 1
    })
  });
});
