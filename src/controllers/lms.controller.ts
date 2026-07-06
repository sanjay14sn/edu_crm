import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateAssignmentContent, generateQuizContent } from '../services/gemini.service';
import { fetchVideoMetadata } from '../services/videoMetadata.service';

export const generateLmsContent = async (req: AuthRequest, res: Response) => {
  try {
    const { type, topic, courseName, difficulty, count, existingTopics, excludeQuestions } =
      req.body || {};

    if (type === 'quizzes') {
      const result = await generateQuizContent({
        topic: String(topic || ''),
        courseName: String(courseName || 'Course'),
        difficulty: String(difficulty || 'Medium'),
        count: Number(count) || 10,
        existingTopics: Array.isArray(existingTopics)
          ? existingTopics.map((item: unknown) => String(item || ''))
          : [],
        excludeQuestions: Array.isArray(excludeQuestions)
          ? excludeQuestions.map((item: unknown) => String(item || ''))
          : [],
        tenantId: req.user?.tenantId,
      });
      return res.status(200).json(result);
    }

    if (type === 'assignments') {
      const result = await generateAssignmentContent({
        topic: String(topic || ''),
        courseName: String(courseName || 'Course'),
        difficulty: String(difficulty || 'Medium'),
        tenantId: req.user?.tenantId,
      });
      return res.status(200).json(result);
    }

    return res.status(400).json({ message: `Unsupported generation type: ${type}` });
  } catch (error: any) {
    console.error('LMS AI generation failed:', error);
    res.status(500).json({
      message: error?.message || 'Failed to generate LMS content',
    });
  }
};

export const resolveVideoMetadata = async (req: AuthRequest, res: Response) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!url) {
      return res.status(400).json({ message: 'Video URL is required' });
    }

    const metadata = await fetchVideoMetadata(url);
    return res.status(200).json(metadata);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resolve video metadata';
    console.error('Video metadata resolution failed:', error);
    return res.status(500).json({ message });
  }
};
