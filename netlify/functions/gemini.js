// netlify/functions/gemini.js
exports.handler = async function(event, context) {
    // Standard headers for CORS
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json"
    };

    // 1. Handle Preflight (OPTIONS)
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };
    }

    // 2. Safely Parse Body
    let userPrompt;
    try {
        const body = JSON.parse(event.body);
        userPrompt = body.contents?.[0]?.parts?.[0]?.text;
        if (!userPrompt) throw new Error("Prompt is empty");
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON Body" }) };
    }

    // 3. Get API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        // Returns JSON now, fixing the crash
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server Error: API Key missing" }) };
    }

    // 4. Call Google
    try {
        // Using the requested model
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: userPrompt }] }]
            })
        });

        // 5. Handle Google Errors (e.g., if model doesn't exist for this specific key or quota issues)
        if (!response.ok) {
            const errorText = await response.text();
            return { 
                statusCode: response.status, 
                headers, 
                body: JSON.stringify({ error: `Google API Error: ${errorText}` }) 
            };
        }

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};