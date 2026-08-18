import { EmailService } from './email.service';

describe('EmailService', () => {
  const OLD_ENV = process.env;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.restoreAllMocks();
  });

  it('reports itself unconfigured with no RESEND_API_KEY', () => {
    delete process.env.RESEND_API_KEY;
    const service = new EmailService();
    expect(service.isConfigured()).toBe(false);
  });

  it('reports itself configured once RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    const service = new EmailService();
    expect(service.isConfigured()).toBe(true);
  });

  it('falls back to a console log and never calls fetch when unconfigured', async () => {
    delete process.env.RESEND_API_KEY;
    const service = new EmailService();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await service.send({ to: 'player@example.com', subject: 'Hello', text: 'Body text' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('player@example.com'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Hello'));
  });

  it('POSTs to the Resend API with the configured key and from-address when configured', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'no-reply@dame-intel.test';
    fetchMock.mockResolvedValue({ ok: true });
    const service = new EmailService();

    await service.send({ to: 'player@example.com', subject: 'Hello', text: 'Body text' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer re_test_key' }),
        body: JSON.stringify({ from: 'no-reply@dame-intel.test', to: 'player@example.com', subject: 'Hello', text: 'Body text' }),
      }),
    );
  });

  it('logs an error but does not throw when Resend responds with a non-ok status', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'invalid recipient' });
    const service = new EmailService();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.send({ to: 'bad', subject: 'x', text: 'y' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('422'));
  });

  it('logs an error but does not throw when the network request itself fails', async () => {
    process.env.RESEND_API_KEY = 're_test_key';
    fetchMock.mockRejectedValue(new Error('network down'));
    const service = new EmailService();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.send({ to: 'player@example.com', subject: 'x', text: 'y' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
