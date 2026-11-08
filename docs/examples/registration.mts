import {
  ChannelRegistry,
  type ChannelDefinition,
  type ChannelRegistration,
} from "@mininglamp-oss/octo-channel-gateway";

export async function withChannel<T>(
  endpoint: string,
  definition: ChannelDefinition,
  serve: (registration: ChannelRegistration) => Promise<T>,
): Promise<T> {
  const registration = await ChannelRegistry.register(endpoint, definition);
  try {
    return await serve(registration);
  } finally {
    await registration.close();
  }
}
