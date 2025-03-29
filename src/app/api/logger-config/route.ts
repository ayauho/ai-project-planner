/**
 * API route for syncing logger configuration
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

// GET handler to retrieve current logger config
export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'logger.config.json');
    
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      return NextResponse.json(config);
    } else {
      // Return default config if file doesn't exist
      const defaultConfig = {
        'hide-all': false,
        'show-by-keyword': {
          works: false,
          keywords: []
        },
        'hide-by-keyword': {
          works: false,
          keywords: []
        }
      };
      return NextResponse.json(defaultConfig);
    }
  } catch (error) {
    logger.error('Error reading logger config', { error }, 'config logger');
    return NextResponse.json({ error: 'Failed to read logger config' }, { status: 500 });
  }
}

// POST handler to update logger config
export async function POST(request: NextRequest) {
  try {
    const configData = await request.json();
    
    // Basic validation
    if (!configData || typeof configData !== 'object') {
      return NextResponse.json({ error: 'Invalid configuration data' }, { status: 400 });
    }
    
    // Ensure required fields exist
    if (!('hide-all' in configData) || 
        !('show-by-keyword' in configData) || 
        !('hide-by-keyword' in configData)) {
      return NextResponse.json({ error: 'Missing required configuration fields' }, { status: 400 });
    }
    
    const configPath = path.join(process.cwd(), 'logger.config.json');
    
    // Write the updated config to file
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating logger config', { error }, 'config logger');
    return NextResponse.json({ error: 'Failed to update logger config' }, { status: 500 });
  }
}
