"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedCenters = exports.deleteCenter = exports.updateCenter = exports.createCenter = exports.getCenterById = exports.getPublicCenterPortal = exports.getCenterPolicy = exports.getCenters = void 0;
const Center_1 = __importDefault(require("../models/Center"));
const centerPolicy_1 = require("../utils/centerPolicy");
function tenantFilter(tenantId) {
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
const getCenters = async (req, res) => {
    try {
        const filter = req.user?.role !== 'super_admin' && req.user?.tenantId
            ? { tenantName: tenantFilter(req.user.tenantId) }
            : {};
        const centers = await Center_1.default.find(filter).sort({ createdAt: -1 });
        res.status(200).json(centers);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching centers', error });
    }
};
exports.getCenters = getCenters;
const getCenterPolicy = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId?.trim();
        if (!tenantId) {
            return res.status(400).json({ message: 'No institute context for this user.' });
        }
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        const policy = await (0, centerPolicy_1.buildCenterPolicyPayload)(tenantId);
        res.status(200).json(policy);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching center policy', error });
    }
};
exports.getCenterPolicy = getCenterPolicy;
const getPublicCenterPortal = async (req, res) => {
    try {
        const { tenant } = req.params;
        const tenantName = Array.isArray(tenant) ? tenant[0] : tenant;
        const center = await (0, centerPolicy_1.getCenterByTenant)(tenantName);
        if (!center || !(0, centerPolicy_1.isFeatureEnabled)(center, 'publicPortalEnabled')) {
            return res.status(404).json({ message: 'Public portal is not available for this institute.' });
        }
        res.status(200).json((0, centerPolicy_1.publicPortalPayload)(center));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching public portal', error });
    }
};
exports.getPublicCenterPortal = getPublicCenterPortal;
const getCenterById = async (req, res) => {
    try {
        const center = await Center_1.default.findById(req.params.id);
        if (!center) {
            return res.status(404).json({ message: 'Center not found' });
        }
        res.status(200).json(center);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching center', error });
    }
};
exports.getCenterById = getCenterById;
const createCenter = async (req, res) => {
    try {
        const { email, phone } = req.body;
        // Check if center with email or phone already exists
        const existingCenter = await Center_1.default.findOne({
            $or: [{ email }, { phone }]
        });
        if (existingCenter) {
            if (existingCenter.email === email) {
                return res.status(400).json({ message: 'A center with this email already exists.' });
            }
            if (existingCenter.phone === phone) {
                return res.status(400).json({ message: 'A center with this mobile number already exists.' });
            }
        }
        const newCenter = new Center_1.default(req.body);
        const savedCenter = await newCenter.save();
        res.status(201).json(savedCenter);
    }
    catch (error) {
        res.status(500).json({ message: error.message || 'Error creating center', error });
    }
};
exports.createCenter = createCenter;
const updateCenter = async (req, res) => {
    try {
        const updatedCenter = await Center_1.default.findByIdAndUpdate(req.params.id, { $set: req.body }, { returnDocument: 'after', runValidators: true });
        if (!updatedCenter) {
            return res.status(404).json({ message: 'Center not found' });
        }
        res.status(200).json(updatedCenter);
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating center', error });
    }
};
exports.updateCenter = updateCenter;
const deleteCenter = async (req, res) => {
    try {
        const deletedCenter = await Center_1.default.findByIdAndDelete(req.params.id);
        if (!deletedCenter) {
            return res.status(404).json({ message: 'Center not found' });
        }
        res.status(200).json({ message: 'Center deleted successfully' });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting center', error });
    }
};
exports.deleteCenter = deleteCenter;
const seedCenters = async () => {
    try {
        const defaultTenant = "Thinklance ";
        // Clean up any incorrectly named center
        await Center_1.default.deleteOne({ name: "Thinklance " });
        const count = await Center_1.default.countDocuments({ name: "Thinklance Center" });
        if (count === 0) {
            console.log(`Seeding default centers for tenant: "${defaultTenant}"...`);
            await Center_1.default.create([
                {
                    name: "Thinklance Center",
                    tenantName: defaultTenant,
                    location: "New York, NY (Hybrid)",
                    manager: "Marcus Vance",
                    email: "info@thinklance.com",
                    phone: "+1 (555) 019-2834",
                    status: "active",
                    enabledModules: ["crm", "students", "trainers", "courses", "attendance", "fees", "jobs", "analytics"]
                },
                {
                    name: "Apex Downtown Hub",
                    tenantName: defaultTenant,
                    location: "Downtown Campus, NY",
                    manager: "Marcus Vance",
                    email: "apex@thinklance.com",
                    phone: "+1 (555) 019-9999",
                    status: "active",
                    enabledModules: ["crm", "students", "trainers", "courses", "attendance", "fees", "jobs", "analytics"]
                }
            ]);
            console.log("Seeding default centers complete.");
        }
    }
    catch (error) {
        console.error("Error seeding default centers:", error);
    }
};
exports.seedCenters = seedCenters;
