// @generated by protoc-gen-es v1.0.0 with parameter "target=ts"
// @generated from file variant-analysis-history-item-schema.proto (package docs, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type {
  BinaryReadOptions,
  FieldList,
  JsonReadOptions,
  JsonValue,
  PartialMessage,
  PlainMessage,
} from "@bufbuild/protobuf";
import { Message, proto3, protoInt64 } from "@bufbuild/protobuf";
import { VariantAnalysisSchema } from "./variant-analysis-schema_pb";

/**
 * @generated from message docs.VariantAnalysisHistoryItemSchema
 */
export class VariantAnalysisHistoryItemSchema extends Message<VariantAnalysisHistoryItemSchema> {
  /**
   * @generated from field: string t = 1;
   */
  t = "";

  /**
   * @generated from field: string failureReason = 2;
   */
  failureReason = "";

  /**
   * @generated from field: int64 resultCount = 3;
   */
  resultCount = protoInt64.zero;

  /**
   * @generated from field: string status = 4;
   */
  status = "";

  /**
   * @generated from field: bool completed = 5;
   */
  completed = false;

  /**
   * @generated from field: docs.VariantAnalysisSchema variantAnalysis = 6;
   */
  variantAnalysis?: VariantAnalysisSchema;

  /**
   * @generated from field: string userSpecifiedLabel = 7;
   */
  userSpecifiedLabel = "";

  constructor(data?: PartialMessage<VariantAnalysisHistoryItemSchema>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime = proto3;
  static readonly typeName = "docs.VariantAnalysisHistoryItemSchema";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "t", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    {
      no: 2,
      name: "failureReason",
      kind: "scalar",
      T: 9 /* ScalarType.STRING */,
    },
    { no: 3, name: "resultCount", kind: "scalar", T: 3 /* ScalarType.INT64 */ },
    { no: 4, name: "status", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "completed", kind: "scalar", T: 8 /* ScalarType.BOOL */ },
    {
      no: 6,
      name: "variantAnalysis",
      kind: "message",
      T: VariantAnalysisSchema,
    },
    {
      no: 7,
      name: "userSpecifiedLabel",
      kind: "scalar",
      T: 9 /* ScalarType.STRING */,
    },
  ]);

  static fromBinary(
    bytes: Uint8Array,
    options?: Partial<BinaryReadOptions>,
  ): VariantAnalysisHistoryItemSchema {
    return new VariantAnalysisHistoryItemSchema().fromBinary(bytes, options);
  }

  static fromJson(
    jsonValue: JsonValue,
    options?: Partial<JsonReadOptions>,
  ): VariantAnalysisHistoryItemSchema {
    return new VariantAnalysisHistoryItemSchema().fromJson(jsonValue, options);
  }

  static fromJsonString(
    jsonString: string,
    options?: Partial<JsonReadOptions>,
  ): VariantAnalysisHistoryItemSchema {
    return new VariantAnalysisHistoryItemSchema().fromJsonString(
      jsonString,
      options,
    );
  }

  static equals(
    a:
      | VariantAnalysisHistoryItemSchema
      | PlainMessage<VariantAnalysisHistoryItemSchema>
      | undefined,
    b:
      | VariantAnalysisHistoryItemSchema
      | PlainMessage<VariantAnalysisHistoryItemSchema>
      | undefined,
  ): boolean {
    return proto3.util.equals(VariantAnalysisHistoryItemSchema, a, b);
  }
}