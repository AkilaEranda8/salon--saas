'use strict';
const { Op, fn, col } = require('sequelize');
const { tenantWhere } = require('../utils/tenantScope');

// ── Public: get review form data ──────────────────────────────────────────────
const getForm = async (req, res) => {
  try {
    const { Payment, Service, Staff, Review } = require('../models');
    const payment = await Payment.findOne({
      where: { review_token: req.params.token },
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name'] },
        { model: Staff,   as: 'staff',   attributes: ['id', 'name'] },
      ],
    });
    if (!payment) return res.status(404).json({ message: 'Invalid or expired review link.' });

    const existing = await Review.findOne({ where: { payment_id: payment.id } });
    if (existing) return res.status(409).json({ message: 'Review already submitted.' });

    return res.json({
      customer_name: payment.customer_name,
      service:       payment.service,
      staff:         payment.staff,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Public: submit review ─────────────────────────────────────────────────────
const submitReview = async (req, res) => {
  try {
    const { Payment, Review } = require('../models');
    const payment = await Payment.findOne({ where: { review_token: req.params.token } });
    if (!payment) return res.status(404).json({ message: 'Invalid or expired review link.' });

    const existing = await Review.findOne({ where: { payment_id: payment.id } });
    if (existing) return res.status(409).json({ message: 'Review already submitted.' });

    const { service_rating, staff_rating, comment, customer_phone } = req.body;
    const svcRating = parseInt(service_rating);
    if (!svcRating || svcRating < 1 || svcRating > 5) {
      return res.status(400).json({ message: 'service_rating must be between 1 and 5.' });
    }
    if (staff_rating !== undefined && staff_rating !== null && staff_rating !== '') {
      const sr = parseInt(staff_rating);
      if (sr < 1 || sr > 5) return res.status(400).json({ message: 'staff_rating must be between 1 and 5.' });
    }

    const review = await Review.create({
      branch_id:      payment.branch_id,
      payment_id:     payment.id,
      customer_name:  payment.customer_name || 'Guest',
      customer_phone: customer_phone || null,
      service_id:     payment.service_id,
      staff_id:       payment.staff_id,
      service_rating: svcRating,
      staff_rating:   staff_rating ? parseInt(staff_rating) : null,
      comment:        comment || null,
      is_approved:    true,
      review_token:   payment.review_token,
    });

    // Invalidate the one-time review token so it cannot be reused
    await payment.update({ review_token: null });

    return res.status(201).json({ message: 'Thank you for your review!', review });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Protected: list reviews ───────────────────────────────────────────────────
const list = async (req, res) => {
  try {
    const { Review, Service, Staff, Branch } = require('../models');
    const where = tenantWhere(req);
    if (req.userBranchId) {
      where.branch_id = req.userBranchId;
    } else if (req.query.branchId) {
      where.branch_id = req.query.branchId;
    }
    if (req.query.serviceId) where.service_id = req.query.serviceId;
    if (req.query.staffId)   where.staff_id   = req.query.staffId;
    if (req.query.approved !== undefined && req.query.approved !== '') {
      where.is_approved = req.query.approved === 'true';
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    const { count, rows } = await Review.findAndCountAll({
      where,
      include: [
        { model: Service, as: 'service', attributes: ['id', 'name'] },
        { model: Staff,   as: 'staff',   attributes: ['id', 'name'] },
        { model: Branch,  as: 'branch',  attributes: ['id', 'name'] },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    const avgResult = await Review.findOne({
      where,
      attributes: [[fn('AVG', col('service_rating')), 'avgRating']],
      raw: true,
    });

    return res.json({
      total:     count,
      page,
      limit,
      avgRating: avgResult?.avgRating ? parseFloat(avgResult.avgRating).toFixed(2) : null,
      reviews:   rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Protected: stats ──────────────────────────────────────────────────────────
const stats = async (req, res) => {
  try {
    const { Review, Service, Staff } = require('../models');
    const where = {};
    if (req.userBranchId) {
      where.branch_id = req.userBranchId;
    } else if (req.query.branchId) {
      where.branch_id = req.query.branchId;
    }

    const [overall, byService, byStaff, dist] = await Promise.all([
      Review.findOne({
        where,
        attributes: [
          [fn('AVG', col('service_rating')), 'avgRating'],
          [fn('COUNT', col('id')),           'total'],
        ],
        raw: true,
      }),
      Review.findAll({
        where,
        attributes: [
          'service_id',
          [fn('AVG', col('service_rating')), 'avgRating'],
          [fn('COUNT', col('Review.id')),    'count'],
        ],
        include: [{ model: Service, as: 'service', attributes: ['name'] }],
        group: ['service_id', 'service.id', 'service.name'],
        raw: true,
        nest: true,
      }),
      Review.findAll({
        where: { ...where, staff_id: { [Op.not]: null } },
        attributes: [
          'staff_id',
          [fn('AVG', col('staff_rating')), 'avgRating'],
          [fn('COUNT', col('Review.id')),  'count'],
        ],
        include: [{ model: Staff, as: 'staff', attributes: ['name'] }],
        group: ['staff_id', 'staff.id', 'staff.name'],
        raw: true,
        nest: true,
      }),
      Review.findAll({
        where,
        attributes: [
          'service_rating',
          [fn('COUNT', col('id')), 'count'],
        ],
        group: ['service_rating'],
        raw: true,
      }),
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of dist) distribution[d.service_rating] = parseInt(d.count);

    return res.json({
      overallAvg:         overall?.avgRating ? parseFloat(overall.avgRating).toFixed(2) : null,
      totalReviews:       parseInt(overall?.total || 0),
      byService:          byService.map((r) => ({
        serviceId: r.service_id,
        name:      r.service?.name || '—',
        avgRating: parseFloat(r.avgRating || 0).toFixed(2),
        count:     parseInt(r.count),
      })),
      byStaff:            byStaff.map((r) => ({
        staffId:  r.staff_id,
        name:     r.staff?.name || '—',
        avgRating: parseFloat(r.avgRating || 0).toFixed(2),
        count:     parseInt(r.count),
      })),
      ratingDistribution: distribution,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: toggle approval ────────────────────────────────────────────────────
const approve = async (req, res) => {
  try {
    const { Review } = require('../models');
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (req.userBranchId && review.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    await review.update({ is_approved: !review.is_approved });
    return res.json(review);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

// ── Admin: delete ─────────────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const { Review } = require('../models');
    const review = await Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (req.userBranchId && review.branch_id !== req.userBranchId) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    await review.destroy();
    return res.status(204).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getForm, submitReview, list, stats, approve, remove };
