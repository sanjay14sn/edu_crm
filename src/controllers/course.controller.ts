import { Request, Response } from 'express';
import Course from '../models/Course';
import { AuthRequest } from '../middleware/auth.middleware';

export const getCourses = async (req: AuthRequest, res: Response) => {
  try {
    const filter: any = {};
    if (req.user?.tenantId && req.user.role !== 'super_admin') {
      filter.tenantId = req.user.tenantId;
    }
    const courses = await Course.find(filter).sort({ createdAt: -1 });
    res.status(200).json(courses.map(c => ({ ...c.toObject(), id: c._id })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching courses', error });
  }
};

export const createCourse = async (req: AuthRequest, res: Response) => {
  try {
    const courseData = { ...req.body };
    if (req.user?.tenantId && !courseData.tenantId) {
      courseData.tenantId = req.user.tenantId;
    }
    const newCourse = new Course(courseData);
    await newCourse.save();
    res.status(201).json({ ...newCourse.toObject(), id: newCourse._id });
  } catch (error) {
    res.status(500).json({ message: 'Error creating course', error });
  }
};

export const updateCourse = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    const course = await Course.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    res.status(200).json({ ...course.toObject(), id: course._id });
  } catch (error) {
    res.status(500).json({ message: 'Error updating course', error });
  }
};

export const deleteCourse = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const course = await Course.findByIdAndDelete(id);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    res.status(200).json({ message: 'Course deleted successfully', id });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting course', error });
  }
};

export const seedCourses = async () => {
  try {
    const defaultTenant = "Thinklance ";
    const count = await Course.countDocuments({ tenantId: defaultTenant });
    if (count === 0) {
      console.log(`Seeding default courses for tenant: "${defaultTenant}"...`);
      await Course.insertMany([
        {
          tenantId: defaultTenant,
          name: "Fullstack Web Dev",
          code: "FS-WD",
          duration: "6 Months",
          fees: 1500
        },
        {
          tenantId: defaultTenant,
          name: "UI/UX Product Design",
          code: "UI-UX",
          duration: "3 Months",
          fees: 1200
        },
        {
          tenantId: defaultTenant,
          name: "Advanced Node.js API",
          code: "ADV-NODE",
          duration: "2 Months",
          fees: 1000
        }
      ]);
      console.log("Seeding default courses complete.");
    }
  } catch (error) {
    console.error("Error seeding default courses:", error);
  }
};

