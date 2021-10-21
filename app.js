const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const validatePassword = (password) => {
  return password.length > 5;
};
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "lkjhgfdsa", (error, payload) => {
      if (error) {
        response.status(400);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};
const convertTweetDbObjectToResponseObject = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

const convertReplyDbObjectToResponseObject = (dbObject) => {
  return {
    name: dbObject.username,
    reply: dbObject.reply,
  };
};

const convertTweetDetailsDbObjectToResponseObject = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};
//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (validatePassword(password)) {
      const createUserQuery = `
                INSERT INTO user
                (name, username, password, gender)
                VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');
            `;
      await db.run(createUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "lkjhgfdsa");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const getTweetsQuery = `
        SELECT 
            user.username,
            tweet.tweet,
            tweet.date_time 
        FROM 
            (user INNER JOIN follower ON user.user_id = follower.follower_user_id) AS T 
            INNER tweet ON T.following_user_id = tweet.user_id 
        ORDER BY tweet.date_time DESC
        LIMIT 4;
    `;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(
    tweetsArray.map((eachTweet) =>
      convertTweetDbObjectToResponseObject(eachTweet)
    )
  );
});

//API 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  const getFollowingUsersQuery = `
        SELECT username FROM user INNER JOIN follower 
        ON user.user_id = follower.following_user_id;
    `;
  const followingArray = await db.all(getFollowingUsersQuery);
  response.send(
    followingArray.map((eachUser) => {
      name: eachUser.username;
    })
  );
});

//API 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getFollowersQuery = `
        SELECT username FROM user INNER JOIN follower 
        ON user.user_id = follower.follower_user_id;
    `;
  const followersArray = await db.all(getFollowersQuery);
  response.send(
    followersArray.map((eachUser) => {
      name: eachUser.username;
    })
  );
});

//API 6
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetQuery = `
        SELECT 
            tweet,
            COUNT(like_id),
            COUNT(reply_id),
            date_time 
        FROM 
            (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T 
            INNER JOIN like ON T.tweet_id = like.tweet_id 
        WHERE tweet_id = ${tweetId}
        GROUP BY tweet_id;
    `;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send({
      tweet: tweet.tweet,
      likes: tweet["COUNT(like_id)"],
      replies: tweet["COUNT(reply_id)"],
      dateTime: tweet.date_time,
    });
  }
});

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetLikesQuery = `
        SELECT username 
        FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id) AS T
        INNER JOIN like ON T.user_id = like.user_id 
        WHERE tweet_id = ${tweetId}
    `;
    const names = await db.all(getTweetLikesQuery);
    if (names === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      response.send({
        likes: names.username,
      });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
        SELECT 
            username,
            reply
        FROM 
            (user INNER JOIN tweet ON user.user_id = tweet.user_id) AS T
            INNER JOIN reply ON T.user_id = reply.user_id 
        WHERE tweet_id = ${tweetId};
    `;
    const repliesArray = await db.all(getRepliesQuery);
    response.send({
      replies: repliesArray.map((eachReply) =>
        convertReplyDbObjectToResponseObject(eachReply)
      ),
    });
  }
);

//API 9
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const getAllTweetsQuery = `
        SELECT 
            tweet,
            COUNT(like_id) AS likes,
            COUNT(reply_id) AS replies,
            date_time 
        FROM 
            (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) AS T 
            INNER JOIN like ON T.tweet_id = like.tweet_id 
        GROUP BY tweet_id
    `;
  const tweetsArray = await db.all(getAllTweetsQuery);
  response.send(
    tweetsArray.map((eachTweet) =>
      convertTweetDetailsDbObjectToResponseObject(eachTweet)
    )
  );
});

//API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const createTweetQuery = `
        INSERT INTO tweet 
        (tweet)
        VALUES ('${tweet}');
    `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const selectTweetQuery = `
        SELECT 
            *
        FROM user INNER JOIN tweet 
        ON user.user_id = tweet.user_id
        WHERE tweet_id = ${tweetId};
    `;
  const dbUser = await db.get(selectTweetQuery);
  if (dbUser === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet_id = ${tweetId};
    `;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
