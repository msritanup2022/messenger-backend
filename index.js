const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const passport = require("passport");
require("dotenv").config();
const cors = require("cors");
const LocalStrategy = require("passport-local").Strategy;
const jwt = require("jsonwebtoken");

const app = express();
const port = 8003;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(passport.initialize());

mongoose
  .connect(process.env.MONGO_CONNECTION, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("====================================");
    console.log("CONNECTED TO DB");
    console.log("====================================");
  })
  .catch((err) => {
    console.log("ERROR CONNECTING TO DB", err);
  });

app.listen(port, () => {
  console.log("SERVER RUNNING ON PORT 8003");
});

const User = require("./models/user");
const Message = require("./models/message");
const multer = require("multer");

// endpoint for registration of users

app.post("/register", (req, res) => {
  const { name, email, password, image } = req.body;

  // Create a new User object
  const newUser = new User({
    name,
    email,
    password,
    image,
  });

  // Save the new User to the database

  newUser
    .save()
    .then(() => {
      res.status(200).json({ message: "User saved Successfully" });
    })
    .catch((err) => {
      console.log("Error registering the User", err);
      res.status(500).json({ message: "Error registering the User" });
    });
});

// function to create token for user

const createToken = (userId) => {
  // set the token payload
  const payload = {
    userId,
  };

  // generate the token with a secret key and expiration time
  const token = jwt.sign(payload, "Q$r2K6W8n!jCW%Zk", {
    expiresIn: "1h",
  });

  return token;
};

// endpoint for login of users

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(404)
      .json({ message: "Please provide email and password" });
  }

  User.findOne({ email })
    .then((user) => {
      if (!user) {
        // User not found
        return res.status(404).json({ message: "User not found" });
      }

      // compare the entered password against the password
      if (user.password !== password) {
        return res.status(404).json({ message: "Invalid password" });
      }

      const token = createToken(user._id);

      res.status(200).json({
        message: "Login successful",
        token,
      });
    })
    .catch((error) => {
      res.status(500).json({ message: "Internal Server Error" });
    });
});

// endpoint to access all the users who is currently logged in

app.get("/users/:userId", (req, res) => {
  const loggedInUserId = req.params.userId;

  User.find({ _id: { $ne: loggedInUserId } })
    .then((users) => {
      res.status(200).json(users);
    })
    .catch((err) => {
      console.log("error", err);
      res.status(500).json({ message: "Error retrieving users" });
    });
});

// endpoint to send a request to a specific user

app.post("/friend-request", async (req, res) => {
  const { currentUserId, selectedUserId } = req.body;

  try {
    // update the recepients friends list array
    await User.findByIdAndUpdate(selectedUserId, {
      $push: { friendRequests: currentUserId },
    });

    // update the senders sentFriend request array
    await User.findByIdAndUpdate(currentUserId, {
      $push: { sentFriendRequests: selectedUserId },
    });
    res.sendStatus(200);
  } catch (err) {
    res.sendStatus(500);
  }
});

// endpoint to show all the friend requests of a particular user

app.get("/friend-request/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // fetch the user documents based on userId
    const user = await User.findById(userId)
      .populate("friendRequests", "name email image")
      .lean();

    const friendRequests = user.friendRequests;
    res.json(friendRequests);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// endpoint to accept a request of a particular person

app.post("/friend-request/accept", async (req, res) => {
  try {
    const { senderId, recepientId } = req.body;

    // retrieve the documents of sender and recepient
    const sender = await User.findById(senderId);
    const recepient = await User.findById(recepientId);

    sender.friends.push(recepientId);
    recepient.friends.push(senderId);

    recepient.friendRequests = recepient.friendRequests.filter(
      (request) => request.toString() != senderId.toString()
    );

    sender.sentFriendRequests = sender.sentFriendRequests.filter(
      (request) => request.toString() != recepientId.toString()
    );

    await sender.save();
    await recepient.save();

    res.status(200).json({ message: "Friend Request Accepted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// endpoint to access all the friends of logged in user

app.get("/accepted-friends/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).populate(
      "friends",
      "name email image"
    );

    const acceptedFriends = user.friends;
    console.log("=======BBB", acceptedFriends);
    res.json(acceptedFriends);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Configure multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "files/"); // Specify the desired destination folder
  },
  filename: function (req, file, cb) {
    // Generate a unique filename for the uploaded file
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// endpoint to post messages and store it in backend

app.post("/messages", upload.single("imageFile"), async (req, res) => {
  try {
    const { senderId, recepientId, messageType, messageText } = req.body;

    const newMessage = new Message({
      senderId,
      recepientId,
      messageType,
      message: messageText,
      timeStamp: new Date(),
      imageUrl: messageType === "image" ? req.file.path : null,
    });

    await newMessage.save();

    res.status(200).json({ message: "Message Sent!" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// endpoint to get the userDetails to design the chat room header

app.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // fetch the user data from userId

    const recepientId = await User.findById(userId);

    res.json(recepientId);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// endponit to fetch the message between 2 users in Chatroom

app.get("/messages/:senderId/:recepientId", async (req, res) => {
  try {
    const { senderId, recepientId } = req.params;

    const messages = await Message.find({
      $or: [
        { senderId: senderId, recepientId: recepientId },
        { senderId: recepientId, recepientId: senderId },
      ],
    }).populate("senderId", "_id name");

    res.json(messages);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// endpoit to delete the message between 2 users in Chatroom

app.post("/deleteMessages", async (req, res) => {
  try {
    const { messages } = req.body;
    console.log("======Messages", messages);

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "invalid messages" });
    }

    await Message.deleteMany({ _id: { $in: messages } });

    res.json({ message: "Messages deleted successfully" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/friend-requests/sent/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId)
      .populate("sentFriendRequests", "name email image")
      .lean();

    const sentFriendRequests = user.sentFriendRequests;

    res.json(sentFriendRequests);
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ error: "Internal Server" });
  }
});

app.get("/friends/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    User.findById(userId)
      .populate("friends")
      .then((user) => {
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        const friendIds = user.friends.map((friend) => friend._id);

        res.status(200).json(friendIds);
      });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: "internal server error" });
  }
});
