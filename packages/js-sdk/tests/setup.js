// Test setup file
global.jest = {
  fn: () => {
    const mockFn = function(...args) {
      mockFn.calls.push(args);
      return mockFn.returnValue;
    };
    mockFn.calls = [];
    mockFn.returnValue = undefined;
    mockFn.mockClear = () => { mockFn.calls = []; };
    mockFn.mockResolvedValue = (value) => {
      mockFn.returnValue = Promise.resolve(value);
      return mockFn;
    };
    mockFn.mockResolvedValueOnce = (value) => {
      const currentCallCount = mockFn.calls.length;
      const originalFn = mockFn;
      const onceFn = function(...args) {
        if (mockFn.calls.length === currentCallCount) {
          mockFn.calls.push(args);
          return Promise.resolve(value);
        }
        return originalFn(...args);
      };
      onceFn.calls = mockFn.calls;
      onceFn.mockClear = mockFn.mockClear;
      onceFn.mockResolvedValue = mockFn.mockResolvedValue;
      onceFn.mockResolvedValueOnce = mockFn.mockResolvedValueOnce;
      return onceFn;
    };
    return mockFn;
  }
};

// Mock fetch
global.fetch = jest.fn();
