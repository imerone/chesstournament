import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import db from "../../db.json"; // Import db.json

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // Example: Show first team name from db.json
  const firstTeamName = db.teams?.[0]?.name;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-gray-600">Oops! Page not found</p>
        {firstTeamName && (
          <p className="mb-2 text-gray-500">Tournament team: {firstTeamName}</p>
        )}
        <a href="/" className="text-blue-500 underline hover:text-blue-700">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;