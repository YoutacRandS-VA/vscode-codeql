// @generated by protoc-gen-es v1.0.0 with parameter "target=ts"
// @generated from file repository-schema.proto (package docs, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3, protoInt64 } from "@bufbuild/protobuf";

/**
 * @generated from message docs.RepositorySchema
 */
export class RepositorySchema extends Message<RepositorySchema> {
  /**
   * @generated from field: int64 id = 1;
   */
  id = protoInt64.zero;

  /**
   * @generated from field: string fullName = 2;
   */
  fullName = "";

  /**
   * @generated from field: bool private = 3;
   */
  private = false;

  constructor(data?: PartialMessage<RepositorySchema>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime = proto3;
  static readonly typeName = "docs.RepositorySchema";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "id", kind: "scalar", T: 3 /* ScalarType.INT64 */ },
    { no: 2, name: "fullName", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "private", kind: "scalar", T: 8 /* ScalarType.BOOL */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): RepositorySchema {
    return new RepositorySchema().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): RepositorySchema {
    return new RepositorySchema().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): RepositorySchema {
    return new RepositorySchema().fromJsonString(jsonString, options);
  }

  static equals(a: RepositorySchema | PlainMessage<RepositorySchema> | undefined, b: RepositorySchema | PlainMessage<RepositorySchema> | undefined): boolean {
    return proto3.util.equals(RepositorySchema, a, b);
  }
}

