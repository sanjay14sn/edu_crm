import { Response } from 'express';
import Job from '../models/Job';
import JobApplication from '../models/JobApplication';
import Batch from '../models/Batch';
import User from '../models/User';
import Student from '../models/Student';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateJobPostingContent } from '../services/gemini.service';
import { tenantFilter } from '../utils/bdeStats';

function buildJobTenantFilter(req: AuthRequest): Record<string, unknown> {
  if (req.user?.role === 'super_admin') return {};
  if (req.user?.tenantId) {
    return { tenantId: tenantFilter(req.user.tenantId) };
  }
  return { tenantId: '__none__' };
}

function resolveTenantId(req: AuthRequest, bodyTenantId?: string): string | null {
  if (req.user?.role === 'super_admin') {
    return bodyTenantId || req.user?.tenantId || null;
  }
  return req.user?.tenantId || null;
}

async function getStudentBatchIds(studentName?: string, tenantId?: string) {
  if (!studentName?.trim()) return [];
  const normalized = studentName.trim().toLowerCase();
  const filter: Record<string, unknown> = {};
  if (tenantId) {
    filter.tenantId = tenantFilter(tenantId);
  }
  const batches = await Batch.find(filter);
  return batches
    .filter((batch) =>
      (batch.studentNames || []).some(
        (name) => name.trim().toLowerCase() === normalized
      )
    )
    .map((batch) => String(batch._id));
}

export const getJobs = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { active: true, ...buildJobTenantFilter(req) };
    let jobs = await Job.find(filter).sort({ createdAt: -1 });

    if (req.user?.role === 'student') {
      const user = await User.findById(req.user.id);
      const student = user
        ? await Student.findOne({ email: user.email })
        : null;
      const tenantId = student?.tenantId || user?.tenantId;
      const studentBatchIds = await getStudentBatchIds(student?.name || user?.name, tenantId);

      jobs = jobs.filter((job) => {
        const targets = job.targetBatchIds || [];
        if (!targets.length) return true;
        return targets.some((batchId) => studentBatchIds.includes(String(batchId)));
      });
    }

    res.status(200).json(jobs.map(j => ({ ...j.toObject(), id: j._id })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching jobs', error });
  }
};

export const createJob = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = resolveTenantId(req, req.body?.tenantId);
    if (!tenantId) {
      return res.status(400).json({ message: 'Your account is not linked to an institute.' });
    }

    const payload = { ...req.body, tenantId };
    const targetBatchIds = Array.isArray(payload.targetBatchIds)
      ? payload.targetBatchIds.map(String)
      : [];

    if (targetBatchIds.length > 0) {
      const batchFilter: Record<string, unknown> = { _id: { $in: targetBatchIds } };
      if (req.user?.role !== 'super_admin') {
        batchFilter.tenantId = tenantFilter(tenantId);
      }
      const batches = await Batch.find(batchFilter);
      payload.targetBatchIds = batches.map((batch) => String(batch._id));
      payload.targetBatchCodes = batches.map((batch) => batch.code);
    } else {
      payload.targetBatchIds = [];
      payload.targetBatchCodes = [];
    }

    const job = new Job(payload);
    const saved = await job.save();
    res.status(201).json({ ...saved.toObject(), id: saved._id });
  } catch (error) {
    res.status(400).json({ message: 'Error creating job', error });
  }
};

export const generateJobContent = async (req: AuthRequest, res: Response) => {
  try {
    const { title, company, type, location } = req.body || {};
    if (!String(title || '').trim()) {
      return res.status(400).json({ message: 'Job title is required' });
    }

    const result = await generateJobPostingContent({
      title: String(title),
      company: company ? String(company) : undefined,
      type: type ? String(type) : undefined,
      location: location ? String(location) : undefined,
      tenantId: req.user?.tenantId,
    });

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Job AI generation failed:', error);
    return res.status(500).json({
      message: error?.message || 'Failed to generate job posting content',
    });
  }
};

export const applyForJob = async (req: AuthRequest, res: Response) => {
  try {
    const jobFilter: Record<string, unknown> = { _id: req.params.id, active: true };
    if (req.user?.role !== 'super_admin' && req.user?.tenantId) {
      jobFilter.tenantId = tenantFilter(req.user.tenantId);
    }

    const job = await Job.findOne(jobFilter);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const user = await User.findById(req.user?.id);
    const student = user ? await Student.findOne({ email: user.email }) : null;
    const tenantId = student?.tenantId || user?.tenantId || job.tenantId;

    const appData = {
      ...req.body,
      tenantId,
      jobId: req.params.id,
      studentId: req.user?.id,
    };
    const application = new JobApplication(appData);
    const saved = await application.save();
    res.status(201).json({ ...saved.toObject(), id: saved._id });
  } catch (error) {
    res.status(400).json({ message: 'Error applying for job', error });
  }
};

export const getApplications = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { ...buildJobTenantFilter(req) };
    if (req.user?.role === 'student') {
      filter.studentId = req.user.id;
    }
    const apps = await JobApplication.find(filter).sort({ createdAt: -1 });
    res.status(200).json(apps.map(a => ({ ...a.toObject(), id: a._id })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching applications', error });
  }
};

export const updateApplicationStatus = async (req: AuthRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = { _id: req.params.id, ...buildJobTenantFilter(req) };
    const updated = await JobApplication.findOneAndUpdate(filter, req.body, { returnDocument: 'after' });
    if (!updated) {
      return res.status(404).json({ message: 'Application not found' });
    }
    res.status(200).json({ ...updated.toObject(), id: updated._id });
  } catch (error) {
    res.status(400).json({ message: 'Error updating application', error });
  }
};

export const deleteJob = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const filter: Record<string, unknown> = { _id: id, ...buildJobTenantFilter(req) };
    const job = await Job.findOneAndUpdate(filter, { active: false }, { returnDocument: 'after' });
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    await JobApplication.deleteMany({ jobId: id, tenantId: job.tenantId });

    res.status(200).json({ message: 'Job deleted successfully', id: job._id });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting job', error });
  }
};

async function migrateOrphanedJobRecords() {
  const missingTenant = {
    $or: [{ tenantId: { $exists: false } }, { tenantId: null }, { tenantId: '' }],
  };

  const orphanedJobs = await Job.find(missingTenant);
  for (const job of orphanedJobs) {
    let tenantId = '';

    if (job.targetBatchIds?.length) {
      const batch = await Batch.findById(job.targetBatchIds[0]);
      tenantId = batch?.tenantId || '';
    }

    if (!tenantId) {
      const app = await JobApplication.findOne({ jobId: String(job._id) });
      if (app?.studentId) {
        const user = await User.findById(app.studentId);
        tenantId = user?.tenantId || '';
        if (!tenantId && app.studentEmail) {
          const student = await Student.findOne({ email: app.studentEmail });
          tenantId = student?.tenantId || '';
        }
      }
    }

    if (tenantId) {
      await Job.updateOne({ _id: job._id }, { $set: { tenantId } });
    }
  }

  const orphanedApps = await JobApplication.find(missingTenant);
  for (const app of orphanedApps) {
    const job = await Job.findById(app.jobId);
    let tenantId = job?.tenantId || '';

    if (!tenantId && app.studentId) {
      const user = await User.findById(app.studentId);
      tenantId = user?.tenantId || '';
      if (!tenantId && app.studentEmail) {
        const student = await Student.findOne({ email: app.studentEmail });
        tenantId = student?.tenantId || '';
      }
    }

    if (tenantId) {
      await JobApplication.updateOne({ _id: app._id }, { $set: { tenantId } });
    }
  }
}

export const seedJobsAndApplications = async () => {
  try {
    await migrateOrphanedJobRecords();

    const defaultTenant = 'Thinklance ';
    const jobCount = await Job.countDocuments({ tenantId: tenantFilter(defaultTenant) });
    if (jobCount === 0) {
      console.log(`Seeding default jobs for tenant: "${defaultTenant}"...`);
      const jobs = await Job.insertMany([
        {
          tenantId: defaultTenant,
          title: "Junior Full Stack Developer",
          company: "Thinklance Solutions",
          location: "New York, NY (Hybrid)",
          type: "Full-time",
          salary: "₹6,00,000 - ₹8,50,000 / year",
          description: "Join our agile engineering team to build client-facing web portals and SaaS dashboards. You will work with React, Node.js, Express, and MongoDB. This role requires clean coding practices and strong teamwork skills.",
          requirements: ["Proficiency in React.js and Node.js/Express", "Understanding of MongoDB and indexing schemas", "Familiarity with Tailwind CSS and Git version control"],
          postedDate: "2026-05-20",
          deadline: "2026-06-25",
          active: true
        },
        {
          tenantId: defaultTenant,
          title: "UI/UX Designer Apprentice",
          company: "Apex Design Hub",
          location: "Remote",
          type: "Internship",
          salary: "₹500 - ₹700 / hour",
          description: "Looking for a passionate junior designer to collaborate on wireframes, prototyping, and visual assets. This role works closely with product managers and developers to craft state-of-the-art mobile and web experiences.",
          requirements: ["Portfolio showing digital design projects", "Figma expertise", "Strong communication and visual storytelling skills"],
          postedDate: "2026-05-19",
          deadline: "2026-06-20",
          active: true
        },
        {
          tenantId: defaultTenant,
          title: "Backend API Engineer",
          company: "Vertex Cloud Systems",
          location: "San Francisco, CA (Onsite)",
          type: "Full-time",
          salary: "₹9,50,000 - ₹11,50,000 / year",
          description: "Scale our cloud backend databases and API routes. Focus is on performance, indexing, security gating, and integration with payment gateways.",
          requirements: ["Strong knowledge of Node.js and Express/NestJS", "SQL query optimization", "Familiarity with Docker and AWS deployment"],
          postedDate: "2026-05-15",
          deadline: "2026-06-10",
          active: true
        }
      ]);
      console.log('Seeding default jobs complete.');

      const appCount = await JobApplication.countDocuments({ tenantId: tenantFilter(defaultTenant) });
      if (appCount === 0 && jobs.length > 0) {
        console.log('Seeding default job applications...');
        const job2 = jobs.find(j => j.title.includes("UI/UX"));
        const job1 = jobs.find(j => j.title.includes("Full Stack"));
        
        const applications = [];
        if (job2) {
          applications.push({
            tenantId: defaultTenant,
            jobId: String(job2._id),
            studentId: "u-4",
            studentName: "Emily Parker",
            studentEmail: "emily@apexacademy.com",
            coverLetter: "I have been designing custom web layouts for the past year and would love to work with your design team. I am very proficient in Figma.",
            appliedDate: "2026-05-20",
            status: "Interviewing"
          });
        }
        if (job1) {
          applications.push({
            tenantId: defaultTenant,
            jobId: String(job1._id),
            studentId: "student-temp-1",
            studentName: "David Miller",
            studentEmail: "david.m@student.com",
            coverLetter: "I recently built a full stack app with React and NestJS. Looking forward to discussing this opportunity.",
            appliedDate: "2026-05-19",
            status: "Pending"
          });
        }
        
        if (applications.length > 0) {
          await JobApplication.insertMany(applications);
          console.log('Seeding default job applications complete.');
        }
      }
    }
  } catch (error) {
    console.error('Error seeding jobs and applications:', error);
  }
};
