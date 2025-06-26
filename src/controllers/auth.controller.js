import { User } from '../models/user.model.js';
import { Company } from '../models/company.model.js'; // Import the Company model
import { sendVerificationEmail, sendResetEmail} from '../services/mailer.service.js';
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

    const { fullname, email, password, phone, role, companyName } = req.body; // Changed companyId to companyName

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

    if (role === 'seller' && !companyName) { // Check for companyName
        res.status(400).json({
            message: "Sellers must provide a company name"
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

    let assignedCompanyId = null;

    if (role === 'seller') {
        // Create a new company
        const newCompany = new Company({
            companyName: companyName,
            // You can add other default company details here if needed
            contactEmail: email, // Assign the seller's email as contact email
        });
        await newCompany.save();
        assignedCompanyId = newCompany._id;
    }

    const token = crypto.randomBytes(20).toString('hex');
    const newUser = new User({
        fullname,
        email,
        password,
        phone: role === 'buyer' ? phone : undefined,
        role,
        ...(assignedCompanyId && { companyId: assignedCompanyId }), // Assign the created company's ID,
        companyId,
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

    const user = await User.findOne({verificationToken:token});

    if(!user) {
        return res.status(400).json({
            message: "Invalid verification code"
        });
    }

    else {
        user.isVerified = true;
        await user.save();
        return res.redirect(`${process.env.FRONTEND_URL}/login`);
    }}
    catch (error)
    {
        return res.status(500).json({
            message: "An error occurred while verifying the user",
            error: error.message
        });
    }

});

const resetPassword = asyncHandler(async (req, res) => {
try{
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({resetToken : token});

    if(!user) {
        return res.status(400).json({
            message: "Invalid Reset code"
        });
    }

        user.password = password;
        await user.save();
        return res.redirect(`${process.env.FRONTEND_URL}/login`);
}
catch (error)
    {
        return res.status(500).json({
            message: "An error occurred while verifying the user",
            error: error.message
        });
    }
}
);

const requestVerificationEmail = asyncHandler(async (req, res) => {
    const {id} = req.params;

    const user = await User.findById(id).populate('fullname').populate('isVerified');

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

    const verificationToken = await sendVerificationEmail(user);

    user.verificationToken = verificationToken;
    await user.save();

    return res.status(200).json({
        message: "Verification email sent"
    });



});

const requestPasswordResetEmail = asyncHandler(async (req, res) => {
    try
    {
    const {id} = req.params;

    const user = await User.findById(id).populate('fullname').populate('isVerified');

    if(!user) {
        return res.status(404).json({
            message: "User not found"
        });
    }

    if(!user.isVerified) {
        return res.status(400).json({
            message: "User is not verified"
        });
    }


    const resetToken = await sendResetEmail(user);

    user.resetToken = resetToken;
    await user.save();

    return res.status(200).json({
        message: "Password reset email sent"
    });}

    catch (error)
    {
        return res.status(500).json({
            message: "An error occurred while verifying the user",
            error: error.message
        });
    }



});

export { registerUser, loginUser, logoutUser, refreshToken , verifyEmail, requestVerificationEmail, requestPasswordResetEmail, resetPassword};
