export const jwtConstants = {
  get secret() {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is missing');
    }
    return process.env.JWT_SECRET;
  }
};
