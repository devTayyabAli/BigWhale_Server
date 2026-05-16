const router = require('express').Router();
const passport = require('passport');
const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('jsonwebtoken');

router.get('/login/success', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(403).json({ error: true, message: 'Not Authorized' });
    }

    const isUser = await User.findOne({ email: req.user?._json?.email });

    if (!isUser) {
      const password = '12345678';
      const hashedPassword = bcrypt.hashSync(password, saltRounds);

      const data = {
        email: req?.user?._json?.email,
        firstName: req?.user?._json?.given_name,
        lastName: req?.user?._json?.family_name,
        profilePicture: req?.user?._json?.picture,
        password: hashedPassword,
        signupMethod: 'google',
        emailVerified: true,
      };

      const createNewUser = await User.create(data);

      if (createNewUser) {
        const token = jwt.sign(
          { email: createNewUser.email },
          process.env.JWT_SECRET_STRING
        );
        res.status(200).json({
          error: false,
          message: 'Logged in successfully.',
          user: { ...createNewUser?._doc, token },
        });
      }
    } else {
      const token = jwt.sign(
        { email: isUser.email },
        process.env.JWT_SECRET_STRING
      );
      res.status(200).json({
        error: false,
        message: 'Logged in successfully.',
        user: { ...isUser?._doc, token },
      });
    }
  } catch (error) {
    console.log(error);
  }
});

router.get('/login/failed', (req, res) => {
  res.status(401).json({
    error: true,
    message: 'Log in failure',
  });
});

router.get('/google', passport.authenticate('google', ['profile', 'email']));

router.get(
  '/google/callback',
  passport.authenticate('google', {
    successRedirect: process.env.FRONTEND_BASE_URL,
    failureRedirect: '/login/failed',
  })
);

router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        error: true,
        message: 'Error during logout',
      });
    }
    res.redirect(process.env.FRONTEND_BASE_URL);
  });
});

module.exports = router;
