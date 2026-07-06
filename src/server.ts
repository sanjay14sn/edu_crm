import dotenv from 'dotenv';

dotenv.config();

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import type { Server } from 'http';
import './config/cloudinary';
import batchRoutes from './routes/batch.routes';

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer | null = null;
let httpServer: Server | null = null;
let isShuttingDown = false;

app.use((_req, res, next) => {
  if (isShuttingDown) {
    return res.status(503).json({ message: 'Server is restarting. Please retry in a moment.' });
  }
  return next();
});

const disconnectMongoose = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

const tryConnect = async (uri: string, label: string) => {
  await disconnectMongoose();
  console.log(`Connecting to ${label}...`);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });
  console.log(`Connected to ${label}.`);
};

// Database connection: Atlas -> local MongoDB -> in-memory fallback
const connectDB = async () => {
  const atlasUri = process.env.MONGODB_URI?.trim();
  const localUri =
    process.env.LOCAL_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017/edu-crm';

  if (atlasUri) {
    try {
      await tryConnect(atlasUri, 'MongoDB Atlas');
      return;
    } catch (atlasError: unknown) {
      const message = atlasError instanceof Error ? atlasError.message : String(atlasError);
      console.warn('MongoDB Atlas connection failed:', message);
      console.warn(
        'Tip: whitelist your IP in MongoDB Atlas, or set LOCAL_MONGODB_URI for local dev.'
      );
    }
  }

  try {
    await tryConnect(localUri, 'local MongoDB');
    return;
  } catch (localError: unknown) {
    const message = localError instanceof Error ? localError.message : String(localError);
    console.warn('Local MongoDB connection failed:', message);
    console.warn('Falling back to mongodb-memory-server for local development...');
  }

  try {
    mongod = await MongoMemoryServer.create();
    await tryConnect(mongod.getUri(), 'MongoDB (in-memory)');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Shutting down server gracefully (${signal})...`);
  try {
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer!.close((err) => (err ? reject(err) : resolve()));
      });
      httpServer = null;
    }

    await disconnectMongoose();

    if (mongod) {
      await mongod.stop();
      mongod = null;
    }

    console.log('Database disconnected and memory server stopped.');
  } catch (err) {
    console.error('Error during database cleanup:', err);
  }
  process.exit(0);
};

// Handle exit signals from nodemon or OS
const isDev = process.env.NODE_ENV !== 'production';

process.on('SIGINT', () => {
  if (isDev) {
    process.exit(0);
    return;
  }
  void gracefulShutdown('SIGINT');
});
process.on('SIGTERM', () => {
  if (isDev) {
    process.exit(0);
    return;
  }
  void gracefulShutdown('SIGTERM');
});
process.on('SIGUSR2', () => {
  if (isDev) {
    process.exit(0);
    return;
  }
  void gracefulShutdown('SIGUSR2');
});

mongoose.connection.on('disconnected', () => {
  if (!isShuttingDown) {
    console.warn('MongoDB disconnected unexpectedly.');
  }
});

// connectDB will be called in startServer() below

import authRoutes from './routes/auth.routes';
import bdeRoutes from './routes/bde.routes';
import dashboardRoutes from './routes/dashboard.routes';
import jobsRoutes from './routes/jobs.routes';
import centerRoutes from './routes/center.routes';
import bdeAdminRoutes from './routes/bdeAdmin.routes';
import studentRoutes from './routes/student.routes';
import trainerRoutes from './routes/trainer.routes';
import attendanceRoutes from './routes/attendance.routes';
import courseRoutes from './routes/course.routes';
import hrRoutes from './routes/hr.routes';
import campaignRoutes from './routes/campaign.routes';
import conversionRoutes from './routes/conversion.routes';
import reportsRoutes from './routes/reports.routes';
import supportRoutes from './routes/support.routes';
import lmsRoutes from './routes/lms.routes';
import uploadRoutes from './routes/upload.routes';
import analyticsRoutes from './routes/analytics.routes';
import sessionFeedbackRoutes from './routes/sessionFeedback.routes';
import notificationRoutes from './routes/notification.routes';
import { seedUsers } from './controllers/auth.controller';
import { seedCourses } from './controllers/course.controller';
import { seedBatches } from './controllers/batch.controller';
import { seedJobsAndApplications } from './controllers/jobs.controller';
import { seedCenters } from './controllers/center.controller';
import { seedStudents } from './controllers/student.controller';
import roleRoutes from './routes/role.routes';
import platformRoutes from './routes/platform.routes';
import { seedSystemRoles } from './controllers/role.controller';

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/bde', bdeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/centers', centerRoutes);
app.use('/api/admin/bdes', bdeAdminRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/conversions', conversionRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/lms', lmsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/session-feedback', sessionFeedbackRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/platform', platformRoutes);


app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof Error && err.message.includes('Unsupported file type')) {
    return res.status(400).json({ message: err.message });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File too large. Maximum upload size is 250MB.' });
  }
  return next(err);
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Edu CRM Backend is running' });
});

const startServer = async () => {
  await connectDB();
  httpServer = app.listen(port, async () => {
    console.log(`Server is running on port ${port}`);
    await seedUsers();
    await seedCourses();
    await seedBatches();
    await seedJobsAndApplications();
    await seedCenters();
    await seedStudents();
    await seedSystemRoles();
  });
};

startServer();
