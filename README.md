# Azure DevOps Dashboard

This is a Next.js project that provides a dashboard for Azure DevOps, built with React and TypeScript.

## Features

- Azure DevOps integration
- Modern UI with Tailwind CSS
- TypeScript support
- ESLint for code quality
- Turbopack for fast development

## Prerequisites

- Node.js (v18 or later)
- npm, yarn, or pnpm
- Azure DevOps account with a Personal Access Token (PAT)

## Getting Started

1. Clone the repository:
```bash
git clone <repository-url>
cd ado
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
ADO_ORGANIZATION=domoreexp
ADO_PROJECT=Teamspace
ADO_PAT=<YOUR_PAT>
ADO_REPOSITORY_ID=<REPO_ID>
```

Replace the placeholders with your actual Azure DevOps information:
- `ADO_ORGANIZATION`: Your Azure DevOps organization name
- `ADO_PROJECT`: Your Azure DevOps project name
- `ADO_PAT`: Your Azure DevOps Personal Access Token
- `ADO_REPOSITORY_ID`: Your Azure DevOps repository ID

## Available Scripts

In the project directory, you can run:

- `npm run dev` - Runs the development server with Turbopack
- `npm run build` - Builds the app for production
- `npm run start` - Runs the production build
- `npm run debug` - Runs the app in debug mode
- `npm run lint` - Runs ESLint to check code quality

## Project Structure

```
ado/
├── src/              # Source code
├── public/           # Static files
├── .next/            # Next.js build output
├── node_modules/     # Dependencies
├── .env              # Environment variables
├── .gitignore        # Git ignore rules
├── next.config.ts    # Next.js configuration
├── package.json      # Project dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── README.md         # Project documentation
```

## Technologies Used

- Next.js 15.3.0
- React 19
- TypeScript
- Tailwind CSS
- Azure DevOps Node API
- ESLint
- Turbopack

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
