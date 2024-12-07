require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const { sql } = require('@vercel/postgres');
const { auth, requiresAuth } = require('express-openid-connect');
const path = require('path');

const port = process.env.PORT || 3000;

app.options('*', cors());
app.use(cors());

app.use(express.json());

function getBaseUrl(hostname) {
    return hostname === 'localhost' ? `http://localhost:${port}` : `https://${hostname}`;
}

app.use("/public", express.static(path.join(__dirname, "..", 'public')));

app.use(express.static(path.join(__dirname, "..", 'client')));


app.use((req, res, next) => {
    return auth({
        authRequired: false,
        auth0Logout: true,
        secret: process.env.AUTH_CLIENT_SECRET,
        baseURL: getBaseUrl(req.hostname),
        clientID: process.env.AUTH_CLIENT_ID,
        issuerBaseURL: process.env.AUTH_ISSUER_BASE_URL,
    })(req, res, next);
});

app.get("/api/user", (req, res) => {
    if (!req.oidc?.user) {
        res.status(401).send({ error: 'User is not authenticated' });
        return;
    }
    res.json(req.oidc?.user);
});

function getUserId(req) {
    return req.oidc.user.sub;
}

async function getAuth0AccessToken() {
    const clientId = process.env.AUTH_CLIENT_ID;
    const clientSecret = process.env.AUTH_CLIENT_SECRET;
    const domain = process.env.AUTH_ISSUER_BASE_URL;
    const audience = `${domain}/api/v2/`;

    const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        audience: audience
    });

    const response = await fetch(`${domain}/oauth/token`, {
        method: 'POST',
        body: body.toString(),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    return (await response.json()).access_token;
}

function deleteAuth0User(userId, accessToken) {
    return fetch(`${process.env.AUTH_ISSUER_BASE_URL}/api/v2/users/${userId}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
}

async function deleteAccount(userId){
    // Delete user's todo items from your database
    await sql`
        DELETE FROM "todo_items"
        WHERE "user_id" = ${userId};
    `;

    // Get access token for the auth0 apis
    const accessToken = await getAuth0AccessToken();

    // Delete the user from Auth0
    await deleteAuth0User(userId, accessToken);
}

// DELETE: Remove a user from the system and Auth0
app.delete('/api/user', requiresAuth(), async (req, res) => {
    const userId = getUserId(req);

    try {
       await deleteAccount(userId);

        res.status(200).json({ message: 'User and their data deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/delete-account',requiresAuth(), async (req,res)=>{
    try{
        await deleteAccount(getUserId(req));
        res.redirect("/logout");
    }catch{
        res.status(500).send("<h1>There was an error while deleting your account</h1>")
    }
});

// GET: Retrieve all  list items
app.get('/api', requiresAuth(), async (req, res) => {
    try {
        const userId = getUserId(req);
        const result = await sql`SELECT * FROM "todo_items" WHERE "user_id" = ${userId};`;
        return res.json(result.rows);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
});

async function queryItem(id, userId) {
    const result = await sql`SELECT * FROM "todo_items" WHERE "id" = ${id} AND "user_id" = ${userId};`;
    if (result.rows.length === 0) {
        return undefined;
    }
    return result.rows[0];
}

// GET: Retrieve a single  list item by ID
app.get('/api/:id', requiresAuth(), async (req, res) => {
    const { id } = req.params;
    const userId = getUserId(req);
    try {
        const result = await queryItem(id, userId);
        if (!result) {
            return res.status(404).send({ error: 'Item not found' });
        }
        return res.json(result);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
});

// POST: Create a new  list item
app.post('/api', requiresAuth(), async (req, res) => {
    const { title, is_completed = false } = req.body;
    const userId = getUserId(req);
    try {
        const result = await sql`
            INSERT INTO "todo_items" ("title", "is_completed", "user_id")
            VALUES (${title}, ${is_completed}, ${userId})
            RETURNING *;
        `;
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// PUT: Update an existing  list item
app.put('/api/:id', requiresAuth(), async (req, res) => {
    const { id } = req.params;
    const { title, is_completed } = req.body;
    const userId = getUserId(req);
    try {
        const result = await sql`
            UPDATE "todo_items"
            SET "title" = ${title}, "is_completed" = ${is_completed}
            WHERE "id" = ${id} AND "user_id" = ${userId}
            RETURNING *;
        `;
        if (result.rowCount === 0) {
            return res.status(404).send({ error: 'Item not found' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE: Remove a  list item by ID
app.delete('/api/:id', requiresAuth(), async (req, res) => {
    const { id } = req.params;
    const userId = getUserId(req);
    try {
        const result = await sql`
            DELETE FROM "todo_items"
            WHERE "id" = ${id} AND "user_id" = ${userId};
        `;
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.status(200).json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

if (require.main === module) {
    app.listen(port, () => console.log(`Server ready on port ${port}.`));
}

module.exports = app;