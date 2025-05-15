export default function errorCatcher(originalFunction) {
  // Prevents the server from crashing when the function throws an error
  // Returns an async function that wraps originalFunction in a try...catch block.
  // This handles errors from both synchronous and asynchronous functions.
  return async (...args) => {
    try {
      await originalFunction(...args);
    } catch (err) {
      console.log('Error caught by errorCatcher: ', err);
    }
  };
}
