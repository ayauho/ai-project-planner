# Installation Guide

This guide will help you set up and run the project in development mode.

## Prerequisites

- Node.js (v16 or later)
- Docker and Docker Compose
- Git

## Setup

1. Clone the repository
2. Rename `.env.development.template` to `.env.development` file
3. Edit the `.env.development` file if needed

## Running the Application

Start the development environment with Docker Compose:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

The application will be available at:
- HTTP: http://localhost:8080
- HTTPS: https://localhost:8443
