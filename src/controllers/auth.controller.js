import { User } from '../models/user.model.js';
import { enqueJob } from '../utils/job.handler.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const registerUser = asyncHandler(async (req, res) => {
    if (!req.body) {
        res.status(400).json({
            message: "Please provide all fields"
        });
        return;
    }

    const { fullname, email, password, phone, role, companyId } = req.body;

    if (!email || !password || !role) {
        res.status(400).json({
            message: "Please provide email, password, and role"
        });
        return;
    }

    if (role === 'buyer' && (!fullname || !phone)) {
        res.status(400).json({
            message: "Buyers must provide fullname and phone"
        });
        return;
    }

    if (role === 'seller' && !companyId) {
        res.status(400).json({
            message: "Sellers must provide a company ID"
        });
        return;
    }

    const existing = await User.findOne({
        $or: [
            { email },
            { phone }
        ]
    });
    if (existing) {
        res.status(400).json({
            message: "Email or phone already exists"
        });
        return;
    }

    const token = crypto.randomBytes(20).toString('hex');
    const newUser = new User({
        fullname,
        email,
        password,
        phone: role === 'buyer' ? phone : undefined,
        role,
        ...(role === 'seller' && { companyId: companyId ? new mongoose.Types.ObjectId(companyId) : undefined }),
        token,
    });
    await newUser.save();
    res.status(200).json({ message: "User registered successfully. Verification email will be sent later." });
});

const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({
            message: "Please provide email and password"
        });
        return;
    }

    const user = await User.findOne({ email });
    if (!user) {
        res.status(400).json({
            message: "User not found"
        });
        return;
    }

    if (!user.isVerified) {
        res.status(400).json({
            message: "Please verify your email."
        });
        return;
    }

    if (!user.password) {
        res.status(400).json({
            message: "Please login with Google"
        });
        return;
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
        res.status(400).json({
            message: "Invalid credentials"
        });
        return;
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 * 10
    });

    res.status(200).json({
        message: "Login successful",
        access_token: accessToken,
        user: {
            _id: user._id,
            fullname: user.fullname,
            email: user.email,
            phone: user.phone,
            role: user.role,
            ...(user.role.includes('seller') && { companyId: user.companyId }),
            points: user.points
        }
    });
});

const logoutUser = asyncHandler(async (req, res) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    })
    res.status(200).json({
        message: "Logged out successfully"
    })
})

const refreshToken = asyncHandler (async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
        return res.status(403).json({ message: "Refresh token not found" });
    }

    let decoded;
    try {
        decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
        return res.status(403).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(decoded._id);
    if (!user) {
        return res.status(403).json({ message: "User not found" });
    }
    const newAccessToken = user.generateAccessToken();

    return res.status(200).json({
        access_token: newAccessToken
    });
});

const verifyEmail = asyncHandler(async (req, res) => {

    try{
    const { token } = req.params;

    const user = await User.findOne({token});

    if(!user) {
        return res.status(400).json({
            message: "Invalid verification code"
        });
    }

    else {
        user.isVerified = true;
        await user.save();
        return res.status(200).json({
            message: "User verified successfully"
        });
    }}
    catch (error)
    {
        return res.status(500).json({
            message: "An error occurred while verifying the user",
            error: error.message
        });
    }

});

const requestVerify = asyncHandler(async (req, res) => {
    const {id} = req.params;

    const user = await User.findById(id);

    if(user.isVerified) {
        return res.status(400).json({
            message: "User is already verified"
        });
    }

    if(!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    const token = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    user.token = token;
    const values = {name: user.fullname, ctaLink: `${process.env.CLIENT_URL}/auth/verify/${token}`,ctaText:"Click here"}
    await enqueJob([user._id],"verify-user-email", "email", values );


    await user.save();

    return res.status(200).json({
        message: "Verification email sent"
    });



});

export { registerUser, loginUser, logoutUser, refreshToken , verifyEmail, requestVerify};
