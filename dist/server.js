"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const path_1 = __importDefault(require("path"));
require("./config/cloudinary");
const batch_routes_1 = __importDefault(require("./routes/batch.routes"));
const app = (0, express_1.default)();
const port = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
app.use('/api/uploads', express_1.default.static(path_1.default.join(process.cwd(), 'uploads')));
const mongodb_memory_server_1 = require("mongodb-memory-server");
let mongod = null;
let httpServer = null;
let isShuttingDown = false;
app.use((_req, res, next) => {
    if (isShuttingDown) {
        return res.status(503).json({ message: 'Server is restarting. Please retry in a moment.' });
    }
    return next();
});
const disconnectMongoose = async () => {
    if (mongoose_1.default.connection.readyState !== 0) {
        await mongoose_1.default.disconnect();
    }
};
const tryConnect = async (uri, label) => {
    await disconnectMongoose();
    console.log(`Connecting to ${label}...`);
    await mongoose_1.default.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
    });
    console.log(`Connected to ${label}.`);
};
// Database connection: Atlas -> local MongoDB -> in-memory fallback
const connectDB = async () => {
    const atlasUri = process.env.MONGODB_URI?.trim();
    const localUri = process.env.LOCAL_MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017/edu-crm';
    if (atlasUri) {
        try {
            await tryConnect(atlasUri, 'MongoDB Atlas');
            return;
        }
        catch (atlasError) {
            const message = atlasError instanceof Error ? atlasError.message : String(atlasError);
            console.warn('MongoDB Atlas connection failed:', message);
            console.warn('Tip: whitelist your IP in MongoDB Atlas, or set LOCAL_MONGODB_URI for local dev.');
        }
    }
    try {
        await tryConnect(localUri, 'local MongoDB');
        return;
    }
    catch (localError) {
        const message = localError instanceof Error ? localError.message : String(localError);
        console.warn('Local MongoDB connection failed:', message);
        console.warn('Falling back to mongodb-memory-server for local development...');
    }
    try {
        mongod = await mongodb_memory_server_1.MongoMemoryServer.create();
        await tryConnect(mongod.getUri(), 'MongoDB (in-memory)');
    }
    catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};
const gracefulShutdown = async (signal) => {
    if (isShuttingDown)
        return;
    isShuttingDown = true;
    console.log(`Shutting down server gracefully (${signal})...`);
    try {
        if (httpServer) {
            await new Promise((resolve, reject) => {
                httpServer.close((err) => (err ? reject(err) : resolve()));
            });
            httpServer = null;
        }
        await disconnectMongoose();
        if (mongod) {
            await mongod.stop();
            mongod = null;
        }
        console.log('Database disconnected and memory server stopped.');
    }
    catch (err) {
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
mongoose_1.default.connection.on('disconnected', () => {
    if (!isShuttingDown) {
        console.warn('MongoDB disconnected unexpectedly.');
    }
});
// connectDB will be called in startServer() below
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const bde_routes_1 = __importDefault(require("./routes/bde.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const jobs_routes_1 = __importDefault(require("./routes/jobs.routes"));
const center_routes_1 = __importDefault(require("./routes/center.routes"));
const bdeAdmin_routes_1 = __importDefault(require("./routes/bdeAdmin.routes"));
const student_routes_1 = __importDefault(require("./routes/student.routes"));
const trainer_routes_1 = __importDefault(require("./routes/trainer.routes"));
const attendance_routes_1 = __importDefault(require("./routes/attendance.routes"));
const course_routes_1 = __importDefault(require("./routes/course.routes"));
const hr_routes_1 = __importDefault(require("./routes/hr.routes"));
const campaign_routes_1 = __importDefault(require("./routes/campaign.routes"));
const conversion_routes_1 = __importDefault(require("./routes/conversion.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const support_routes_1 = __importDefault(require("./routes/support.routes"));
const lms_routes_1 = __importDefault(require("./routes/lms.routes"));
const upload_routes_1 = __importDefault(require("./routes/upload.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const sessionFeedback_routes_1 = __importDefault(require("./routes/sessionFeedback.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const auth_controller_1 = require("./controllers/auth.controller");
const course_controller_1 = require("./controllers/course.controller");
const batch_controller_1 = require("./controllers/batch.controller");
const jobs_controller_1 = require("./controllers/jobs.controller");
const center_controller_1 = require("./controllers/center.controller");
const student_controller_1 = require("./controllers/student.controller");
const role_routes_1 = __importDefault(require("./routes/role.routes"));
const platform_routes_1 = __importDefault(require("./routes/platform.routes"));
const feeReminder_routes_1 = __importDefault(require("./routes/feeReminder.routes"));
const leadChatbot_routes_1 = __importDefault(require("./routes/leadChatbot.routes"));
const leadWebhook_routes_1 = __importDefault(require("./routes/leadWebhook.routes"));
const role_controller_1 = require("./controllers/role.controller");
const feeReminder_cron_1 = require("./jobs/feeReminder.cron");
const leadInbound_cron_1 = require("./jobs/leadInbound.cron");
const leadReply_cron_1 = require("./jobs/leadReply.cron");
const leadFollowUp_cron_1 = require("./jobs/leadFollowUp.cron");
const campaign_cron_1 = require("./jobs/campaign.cron");
// Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/batches', batch_routes_1.default);
app.use('/api/bde', bde_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/jobs', jobs_routes_1.default);
app.use('/api/centers', center_routes_1.default);
app.use('/api/admin/bdes', bdeAdmin_routes_1.default);
app.use('/api/students', student_routes_1.default);
app.use('/api/trainers', trainer_routes_1.default);
app.use('/api/attendance', attendance_routes_1.default);
app.use('/api/courses', course_routes_1.default);
app.use('/api/hr', hr_routes_1.default);
app.use('/api/campaigns', campaign_routes_1.default);
app.use('/api/conversions', conversion_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/support', support_routes_1.default);
app.use('/api/lms', lms_routes_1.default);
app.use('/api/upload', upload_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/session-feedback', sessionFeedback_routes_1.default);
app.use('/api/notifications', notification_routes_1.default);
app.use('/api/roles', role_routes_1.default);
app.use('/api/platform', platform_routes_1.default);
app.use('/api', feeReminder_routes_1.default);
app.use('/api', leadWebhook_routes_1.default);
app.use('/api/lead-chatbot', leadChatbot_routes_1.default);
app.use((err, _req, res, next) => {
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
        await (0, auth_controller_1.seedUsers)();
        await (0, course_controller_1.seedCourses)();
        await (0, batch_controller_1.seedBatches)();
        await (0, jobs_controller_1.seedJobsAndApplications)();
        await (0, center_controller_1.seedCenters)();
        await (0, student_controller_1.seedStudents)();
        await (0, role_controller_1.seedSystemRoles)();
        (0, feeReminder_cron_1.startFeeReminderCron)();
        (0, leadInbound_cron_1.startLeadInboundCron)();
        (0, leadReply_cron_1.startLeadReplyCron)();
        (0, leadFollowUp_cron_1.startLeadFollowUpCron)();
        (0, campaign_cron_1.startCampaignCron)();
    });
};
startServer();
