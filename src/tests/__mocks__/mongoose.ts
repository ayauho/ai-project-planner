/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* eslint-disable unused-imports/no-unused-vars */

import { EventEmitter } from 'events';
import { ObjectId } from 'mongodb';
import { ProjectValidationError } from '../../lib/project/errors';
import { TaskValidationError } from '../../lib/task/errors';
import { mockLogger as logger } from '../mocks/logger';

class MockObjectId {
  id: string;
  _bsontype = 'ObjectID';

  constructor(id?: string | ObjectId | MockObjectId) {
    if (id instanceof ObjectId || id instanceof MockObjectId) {
      this.id = id.toString();
    } else if (id && typeof id === 'string') {
      this.id = id;
    } else {
      this.id = Math.random().toString(36).substr(2, 24);
    }
  }

  toString() {
    return this.id;
  }

  equals(other: any) {
    if (!other) return false;
    const otherId = other instanceof ObjectId || other instanceof MockObjectId ? 
      other.toString() : 
      other.toString();
    return this.toString() === otherId;
  }

  toJSON() {
    return this.id;
  }

  inspect() {
    return `ObjectId("${this.id}")`;
  }

  toHexString() {
    return this.toString();
  }
}

type SchemaTypesType = {
  String: StringConstructor;
  Number: NumberConstructor;
  Date: DateConstructor;
  Boolean: BooleanConstructor;
  ObjectId: typeof MockObjectId;
};

const SchemaTypes: SchemaTypesType = {
  String: String,
  Number: Number,
  Date: Date,
  Boolean: Boolean,
  ObjectId: MockObjectId
};

class Schema<T = any> extends EventEmitter {
  private definition: Record<string, any>;
  private options: Record<string, any>;
  private indexes: Array<{ fields: Record<string, number>, options: Record<string, any> }> = [];
  private _modelName: string = '';
  protected hooks: { 
    pre: { [key: string]: Function[] };
    post: { [key: string]: Function[] };
  } = { pre: {}, post: {} };

  static Types: SchemaTypesType = SchemaTypes;

  constructor(definition: Record<string, any>, options: Record<string, any> = {}) {
    super();
    this.definition = definition;
    this.options = options;
  }

  index(fields: Record<string, number>, options: Record<string, any> = {}) {
    this.indexes.push({ fields, options });
    return this;
  }

  pre(method: string, fn: Function) {
    if (!this.hooks.pre[method]) {
      this.hooks.pre[method] = [];
    }
    this.hooks.pre[method].push(fn);
    return this;
  }

  post(method: string, fn: Function) {
    if (!this.hooks.post[method]) {
      this.hooks.post[method] = [];
    }
    this.hooks.post[method].push(fn);
    return this;
  }

  getIndexes() {
    return this.indexes;
  }

  get modelName(): string {
    return this._modelName;
  }

  setModelName(name: string): void {
    this._modelName = name;
  }

  getHooks(): { pre: { [key: string]: Function[] }; post: { [key: string]: Function[] } } {
    return this.hooks;
  }
}

interface IMockModel<T = any> {
  new(data: Record<string, any>): T & {
    save(): Promise<T>;
    validate(): Promise<void>;
    toObject(): T;
  };
  findById(id: string | ObjectId): Promise<T | null>;
  find(query: Record<string, any>): Promise<T[]>;
  findOne(query: Record<string, any>): Promise<T | null>;
  findByIdAndDelete(id: string | ObjectId): Promise<T | null>;
  clearDocuments(): void;
}

function model<T>(name: string, schema?: Schema<T>): IMockModel<T> {
  const requiredFields: { [key: string]: string[] } = {
    'Project': ['userId', 'name', 'description'],
    'Task': ['projectId', 'name', 'description']
  };

  const uniqueIndexes = schema?.getIndexes().filter(idx => idx.options.unique) || [];

  schema?.setModelName(name);

  return class MockModel {
    private static documents = new Map<string, any>();
    private data: Record<string, any>;
    [key: string]: any;

    constructor(data: Record<string, any>) {
      this.data = this.cloneData(data);
      
      if (!this.data._id) {
        this.data._id = new MockObjectId();
      }
      if (!this.data.createdAt) {
        this.data.createdAt = new Date();
      }
      this.data.updatedAt = new Date();
      
      // Set default values for task
      if (name === 'Task') {
        if (this.data.childrenCount === undefined) this.data.childrenCount = 0;
        if (this.data.descendantCount === undefined) this.data.descendantCount = 0;
      }
      
      Object.assign(this, this.cloneData(this.data));
    }

    private static async validateUniqueIndexes(data: Record<string, any>, excludeId?: string) {
      for (const index of uniqueIndexes) {
        const query = Object.keys(index.fields).reduce((acc, field) => {
          acc[field] = data[field];
          return acc;
        }, {} as Record<string, any>);

        const existing = Array.from(MockModel.documents.values())
          .find(doc => {
            if (excludeId && doc._id.toString() === excludeId) {
              return false;
            }
            return Object.entries(query).every(([key, value]) => {
              if (value instanceof MockObjectId || value instanceof ObjectId) {
                return doc[key].toString() === value.toString();
              }
              return doc[key] === value;
            });
          });

        if (existing) {
          throw new Error(
            `Duplicate value for unique index: ${Object.keys(index.fields).join('+')}`
          );
        }
      }
    }

    private cloneData(data: Record<string, any>): Record<string, any> {
      const clone: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value instanceof ObjectId || value instanceof MockObjectId || (value && value._bsontype === 'ObjectID')) {
          clone[key] = new MockObjectId(value.toString());
        } else if (value instanceof Date) {
          clone[key] = new Date(value);
        } else if (Array.isArray(value)) {
          clone[key] = value.map(item => typeof item === 'object' && item !== null ? this.cloneData(item) : item);
        } else if (typeof value === 'object' && value !== null) {
          clone[key] = this.cloneData(value);
        } else {
          clone[key] = value;
        }
      }
      return clone;
    }

    async save() {
      // Sync instance properties to data
      Object.entries(this).forEach(([key, value]) => {
        if (key !== 'data' && key !== 'isModified' && !key.startsWith('_')) {
          this.data[key] = value;
        }
      });

      await this.validate();
      
      // Check unique constraints
      await MockModel.validateUniqueIndexes(this.data, this.data._id?.toString());

      this.data.updatedAt = new Date();
      Object.assign(this, { updatedAt: this.data.updatedAt });

      if (!this.data._id) {
        this.data._id = new MockObjectId();
      }

      const clonedData = this.cloneData(this.data);
      MockModel.documents.set(clonedData._id.toString(), clonedData);
      
      // Sync back to instance
      Object.assign(this, this.cloneData(clonedData));
      
      return this;
    }

    async validate() {
      try {
        // Get validation hooks using the new getter
        const preValidateHooks = schema?.getHooks()?.pre?.validate || [];
        for (const hook of preValidateHooks) {
          await new Promise<void>((resolve, reject) => {
            hook.call(this, (err?: Error) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }

        const modelRequired = requiredFields[name] || [];
        const missingFields = modelRequired.filter(field => {
          const value = this.data[field];
          return value === undefined || value === null || value === '';
        });
        
        if (missingFields.length > 0) {
          const ErrorClass = name === 'Project' ? ProjectValidationError : TaskValidationError;
          const error = new ErrorClass(`Required fields missing: ${missingFields.join(', ')}`);
          logger.error('Validation failed', { error, data: this.data });
          throw error;
        }

        // Additional Task validation
        if (name === 'Task' && this.data.position) {
          const { x, y } = this.data.position;
          if (typeof x !== 'number' || typeof y !== 'number') {
            const error = new TaskValidationError('Position x and y must be numbers');
            logger.error('Validation failed', { error, position: this.data.position });
            throw error;
          }
        }
      } catch (error) {
        throw error instanceof Error ? error : new Error('Unknown validation error');
      }
    }

    toObject() {
      return this.cloneData(this.data);
    }

    static clearDocuments() {
      this.documents.clear();
    }

    static async findById(id: string | ObjectId) {
      const idString = id.toString();
      const doc = this.documents.get(idString);
      if (!doc) return null;
      return new MockModel(doc);
    }

    static async find(query: Record<string, any>) {
      const results = Array.from(this.documents.values())
        .filter(doc => Object.entries(query).every(([key, value]) => {
          if (key === '$ne') return true;
          
          if (value && typeof value === 'object') {
            if ('$ne' in value) {
              const compareValue = value.$ne;
              return !this.compareValues(doc[key], compareValue);
            }
          }
          return this.compareValues(doc[key], value);
        }));

      return results.map(doc => new MockModel(doc));
    }

    private static compareValues(docValue: any, queryValue: any): boolean {
      if (docValue instanceof MockObjectId || docValue instanceof ObjectId || (docValue && docValue._bsontype === 'ObjectID')) {
        return docValue.toString() === queryValue?.toString();
      }
      if (queryValue instanceof MockObjectId || queryValue instanceof ObjectId || (queryValue && queryValue._bsontype === 'ObjectID')) {
        return queryValue.toString() === docValue?.toString();
      }
      return docValue === queryValue;
    }

    static async findOne(query: Record<string, any>) {
      const docs = await this.find(query);
      return docs[0] || null;
    }

    static async findByIdAndDelete(id: string | ObjectId) {
      const idString = id.toString();
      const doc = this.documents.get(idString);
      if (doc) {
        this.documents.delete(idString);
        return new MockModel(doc);
      }
      return null;
    }
  } as unknown as IMockModel<T>;
}

export default {
  Schema,
  model,
  Types: Schema.Types,
};