# Facebook Messenger AI Business Assistant

An AI-powered business growth and lead generation consultant that operates through Facebook Messenger. Built with Node.js, Express, and OpenAI's GPT API.

## Features

- 24/7 AI Business Consulting
- Lead Generation Strategies
- Business Development Advice
- Sales Funnel Optimization
- Interactive Conversation Support
- Appointment Scheduling

## Setup

1. Clone the repository:
```bash
git clone [your-repo-url]
cd Facebook-Messenger-Openai
```

2. Install dependencies:
```bash
npm install
```

3. Create a .env file with your credentials:
```bash
cp .env.example .env
```

4. Update the .env file with your:
- Facebook Page Access Token
- Page ID
- OpenAI API Key
- Verify Token

5. Start the server:
```bash
npm start
```

## Environment Variables

- `TOKEN`: Facebook Page Access Token
- `PAGE_ID`: Your Facebook Page ID
- `OPENAI_API_KEY`: Your OpenAI API Key
- `VERIFY_TOKEN`: Your webhook verify token

## Usage

1. Set up a Facebook App in the Meta Developer Console
2. Configure the Messenger webhook with your server URL
3. Add the required permissions (pages_messaging)
4. Set your Privacy Policy URL
5. Submit for App Review

## Development

The project structure:
- `index.js`: Main application file
- `routes/`: API routes
  - `fbWebhookRoute.js`: Facebook webhook handling
  - `sendMessageRoute.js`: Message sending logic
- `helper/`: Helper functions
  - `openaiApi.js`: OpenAI integration
  - `messengerApi.js`: Facebook Messenger API integration

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License.
