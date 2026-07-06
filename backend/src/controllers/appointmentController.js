const prisma = require('../prisma');

// List all doctors
const listDoctors = async (req, res) => {
  try {
    const doctors = await prisma.user.findMany({
      where: { role: 'DOCTOR' },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
    res.status(200).json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ message: 'Server error listing doctors.' });
  }
};

// Create a new appointment
const createAppointment = async (req, res) => {
  try {
    const { doctorId, startTime, endTime } = req.body;
    const patientId = req.user.id;

    // 1. Ensure requester is a PATIENT
    if (req.user.role !== 'PATIENT') {
      return res.status(403).json({ message: 'Only patients can book appointments.' });
    }

    if (!doctorId || !startTime || !endTime) {
      return res.status(400).json({ message: 'Doctor ID, start time, and end time are required.' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // 2. Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid start time or end time format.' });
    }

    if (start >= end) {
      return res.status(400).json({ message: 'End time must be after start time.' });
    }

    if (start < new Date()) {
      return res.status(400).json({ message: 'Appointments must be scheduled for future times.' });
    }

    // 3. Verify doctor exists and is actually a doctor
    const doctor = await prisma.user.findUnique({
      where: { id: doctorId }
    });

    if (!doctor || doctor.role !== 'DOCTOR') {
      return res.status(400).json({ message: 'The selected doctor does not exist.' });
    }

    // 4. Check for double booking (overlapping appointments)
    const overlappingAppointment = await prisma.appointment.findFirst({
      where: {
        OR: [
          { doctorId },
          { patientId }
        ],
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } }
        ]
      }
    });

    if (overlappingAppointment) {
      const conflictUser = overlappingAppointment.doctorId === doctorId ? 'doctor' : 'you';
      return res.status(400).json({
        message: `Time conflict: The ${conflictUser} already has an appointment booked during this time.`
      });
    }

    // 5. Create the appointment
    const appointment = await prisma.appointment.create({
      data: {
        doctorId,
        patientId,
        startTime: start,
        endTime: end
      },
      include: {
        doctor: {
          select: { id: true, name: true, email: true }
        },
        patient: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.status(201).json({
      message: 'Appointment booked successfully.',
      appointment
    });
  } catch (error) {
    console.error('Error booking appointment:', error);
    res.status(500).json({ message: 'Server error booking appointment.' });
  }
};

// Get list of appointments for the logged-in user
const getAppointments = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    let appointments;

    if (role === 'DOCTOR') {
      appointments = await prisma.appointment.findMany({
        where: { doctorId: userId },
        include: {
          patient: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { startTime: 'asc' }
      });
    } else {
      appointments = await prisma.appointment.findMany({
        where: { patientId: userId },
        include: {
          doctor: {
            select: { id: true, name: true, email: true }
          }
        },
        orderBy: { startTime: 'asc' }
      });
    }

    res.status(200).json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ message: 'Server error retrieving appointments.' });
  }
};

// Verify if a user is allowed to join the video room based on current time
const verifyRoomAccess = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. Fetch appointment details
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: { select: { id: true, name: true } },
        patient: { select: { id: true, name: true } }
      }
    });

    if (!appointment) {
      return res.status(404).json({ allowed: false, message: 'Appointment not found.' });
    }

    // 2. Validate participant membership
    if (appointment.doctorId !== userId && appointment.patientId !== userId) {
      return res.status(403).json({ allowed: false, message: 'You are not a participant in this appointment.' });
    }

    // 3. Time-gate check (10 minutes buffer before start, up until end time)
    const now = new Date();
    const startTime = new Date(appointment.startTime);
    const endTime = new Date(appointment.endTime);

    const earlyLimit = new Date(startTime.getTime() - 10 * 60 * 1000); // 10 minutes early

    if (now < earlyLimit) {
      const minutesRemaining = Math.ceil((startTime.getTime() - now.getTime()) / 60000);
      return res.status(400).json({
        allowed: false,
        message: `Too early. You can join the video room in ${minutesRemaining - 10} minute(s).`
      });
    }

    if (now > endTime) {
      return res.status(400).json({
        allowed: false,
        message: 'This appointment session has already concluded.'
      });
    }

    // 4. Access approved
    res.status(200).json({
      allowed: true,
      message: 'Access granted.',
      appointment: {
        id: appointment.id,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        doctor: appointment.doctor,
        patient: appointment.patient
      }
    });
  } catch (error) {
    console.error('Error verifying room access:', error);
    res.status(500).json({ allowed: false, message: 'Server error validating room access.' });
  }
};

module.exports = {
  listDoctors,
  createAppointment,
  getAppointments,
  verifyRoomAccess
};
